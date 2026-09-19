import { readFileSync, existsSync } from 'node:fs';
import { defineConfig, type Plugin, type ViteDevServer } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import * as api from './src/server/api.ts';

// The key is read here, on the server, and put in this process's environment.
// It is never exposed to the page: Vite only ships `import.meta.env` values
// prefixed VITE_, and nothing here is.
function loadEnv(): void {
  if (!existsSync('.env')) return;
  for (const line of readFileSync('.env', 'utf8').split(/\r?\n/)) {
    const match = /^([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line.trim());
    if (!match) continue;
    const key = match[1]!;
    const value = (match[2] ?? '').replace(/^['"]|['"]$/g, '').trim();
    if (value && !process.env[key]) process.env[key] = value;
  }
}

async function readJsonBody(req: { on: (e: string, cb: (c?: unknown) => void) => void }): Promise<unknown> {
  const chunks: Buffer[] = [];
  await new Promise<void>((resolve, reject) => {
    req.on('data', (c) => chunks.push(Buffer.from(c as Buffer)));
    req.on('end', () => resolve());
    req.on('error', () => reject(new Error('could not read the request')));
  });
  const text = Buffer.concat(chunks).toString('utf8');
  return text.length > 0 ? JSON.parse(text) : {};
}

/**
 * The loop the demo has to support, served locally: save an annotation, run the
 * model on that same transcript, recompute the agreement, build the report,
 * take in a transcript file.
 */
function apiPlugin(): Plugin {
  return {
    name: 'reasoning-trajectory-api',
    configureServer(server: ViteDevServer) {
      loadEnv();
      server.middlewares.use(async (req, res, next) => {
        const url = req.url ?? '';
        if (!url.startsWith('/api/')) return next();

        const send = (status: number, body: unknown) => {
          res.statusCode = status;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify(body));
        };

        // [OURS: these routes spend API credit and rewrite data/live, so a
        // request made by another site's page is refused. A request with no
        // Origin (curl, the scripts) is let through: this guards a local dev
        // server against cross-site requests, it is not authentication.]
        const origin = req.headers.origin;
        const fetchSite = req.headers['sec-fetch-site'];
        const originHost = (() => {
          try {
            return origin ? new URL(origin).host : null;
          } catch {
            return 'invalid';
          }
        })();
        if (
          (origin !== undefined && originHost !== req.headers.host) ||
          (fetchSite !== undefined && fetchSite !== 'same-origin' && fetchSite !== 'none')
        ) {
          return send(403, { error: 'cross-origin request refused' });
        }

        try {
          const path = url.split('?')[0] ?? '';
          const method = req.method ?? 'GET';

          if (path === '/api/state' && method === 'GET') {
            const r = api.getState();
            return send(r.status, r.body);
          }

          const sessionMatch = /^\/api\/session\/([^/]+)(\/[a-z]+(?:\/[a-z]+)?)?$/.exec(path);
          if (sessionMatch) {
            const id = decodeURIComponent(sessionMatch[1]!);
            const action = sessionMatch[2];
            if (!action && method === 'GET') {
              const r = api.getSession(id);
              return send(r.status, r.body);
            }
            if (action === '/annotation' && method === 'PUT') {
              const body = (await readJsonBody(req)) as Parameters<typeof api.putAnnotation>[1];
              const r = api.putAnnotation(id, body);
              return send(r.status, r.body);
            }
            if (action === '/generate' && method === 'POST') {
              const r = await api.generate(id);
              return send(r.status, r.body);
            }
            // Layer 2: its own read, its own save, its own model call.
            if (action === '/moves' && method === 'GET') {
              const r = api.getMoves(id);
              return send(r.status, r.body);
            }
            if (action === '/moves' && method === 'PUT') {
              const body = (await readJsonBody(req)) as Parameters<typeof api.putMoves>[1];
              const r = api.putMoves(id, body);
              return send(r.status, r.body);
            }
            if (action === '/moves/classify' && method === 'POST') {
              const r = await api.classifyMoves(id);
              return send(r.status, r.body);
            }
          }

          if (path === '/api/report' && method === 'POST') {
            const r = await api.buildReport();
            return send(r.status, r.body);
          }

          if (path === '/api/reset' && method === 'POST') {
            const r = api.reset();
            return send(r.status, r.body);
          }

          if (path === '/api/transcript' && method === 'POST') {
            const body = (await readJsonBody(req)) as Parameters<typeof api.addTranscript>[0];
            const r = api.addTranscript(body);
            return send(r.status, r.body);
          }

          return send(404, { error: `no endpoint ${method} ${path}` });
        } catch (error) {
          return send(500, { error: error instanceof Error ? error.message : String(error) });
        }
      });
    },
  };
}

export default defineConfig({
  root: 'app',
  plugins: [react(), tailwindcss(), apiPlugin()],
  server: { fs: { allow: ['..'] } },
});
