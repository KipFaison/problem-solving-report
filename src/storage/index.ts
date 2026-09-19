// Every read and write of project data goes through here (PLAN P2).
// Direct file IO, one module, so a remote store could replace it later
// without touching callers. No adapter contract until there is a second
// implementation to justify one.
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { REPO_ROOT } from '../config.ts';

export function readJson<T>(relPath: string): T {
  return JSON.parse(readFileSync(resolve(REPO_ROOT, relPath), 'utf8')) as T;
}

export function writeJson(relPath: string, value: unknown): void {
  const full = resolve(REPO_ROOT, relPath);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, JSON.stringify(value, null, 2) + '\n', 'utf8');
}

export function exists(relPath: string): boolean {
  return existsSync(resolve(REPO_ROOT, relPath));
}

export function listJson(relDir: string): string[] {
  const full = resolve(REPO_ROOT, relDir);
  if (!existsSync(full)) return [];
  return readdirSync(full)
    .filter((f) => f.endsWith('.json'))
    .map((f) => join(relDir, f))
    .sort();
}

export function listDirs(relDir: string): string[] {
  const full = resolve(REPO_ROOT, relDir);
  if (!existsSync(full)) return [];
  return readdirSync(full, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();
}
