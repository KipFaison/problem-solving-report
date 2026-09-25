import { useEffect, useState } from 'react';
import { WorkspaceProvider, useWorkspace } from './workspace.tsx';
import { reset } from './api.ts';
import { Report } from './Report.tsx';
import { Annotate } from './Annotate.tsx';
import { Internal } from './Internal.tsx';

// Three surfaces, side by side: the tutor who marks up a session, the student
// and parent who read the report, and the working figures behind both. All
// three read the same live workspace, so a save on one shows on the others.
type Surface = 'annotate' | 'report' | 'internal';

const SURFACES: Array<{ id: Surface; label: string; note: string }> = [
  { id: 'annotate', label: 'Tutor Annotation', note: 'Mark up a session, then run the model on it' },
  { id: 'report', label: 'Student Report', note: 'What a student and a parent read together' },
  { id: 'internal', label: 'Internal Feature', note: 'Working figures, not shown to families' },
];

/** The surface named by the address bar, so a screen can be linked to. */
function surfaceInHash(): Surface | null {
  const name = window.location.hash.replace('#', '');
  return SURFACES.some((s) => s.id === name) ? (name as Surface) : null;
}

function Shell() {
  const [surface, setSurface] = useState<Surface>(() => surfaceInHash() ?? 'annotate');
  const { state, error, refresh } = useWorkspace();
  const [resetting, setResetting] = useState(false);
  // Bumped on reset. Used as the key of the surfaces, so a reset remounts them
  // and no surface keeps showing a session or a draft that no longer exists.
  const [generation, setGeneration] = useState(0);
  const active = SURFACES.find((s) => s.id === surface) ?? SURFACES[0]!;
  // The report opens only once the model has read the newest session, so it
  // is never read ahead of the session just worked on. [OURS: owner decision
  // 2026-09-18]
  const newest = state?.sessions.reduce<(typeof state.sessions)[number] | undefined>(
    (latest, s) => (latest === undefined || s.session_index > latest.session_index ? s : latest),
    undefined,
  );
  const reportReady = newest?.modelled === true;
  // Only once the workspace has loaded: before that nothing is known about the
  // newest session, and the report tab would close itself on every reload.
  useEffect(() => {
    if (state && !reportReady && surface === 'report') setSurface('annotate');
  }, [state, reportReady, surface]);
  // The address bar follows the open surface, and the Back button follows it.
  useEffect(() => {
    if (surfaceInHash() !== surface) window.location.hash = surface;
  }, [surface]);
  useEffect(() => {
    const onHash = () => setSurface(surfaceInHash() ?? 'annotate');
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const onReset = async () => {
    if (
      !window.confirm(
        'Put the demo back to how it opens? Every annotation saved, every model run and every transcript uploaded since then is deleted.',
      )
    )
      return;
    setResetting(true);
    try {
      await reset();
      await refresh();
      setGeneration((g) => g + 1);
    } catch (e) {
      window.alert(e instanceof Error ? e.message : String(e));
    } finally {
      setResetting(false);
    }
  };

  return (
    <div className="min-h-screen">
      <header className="border-b px-8 py-4" style={{ borderColor: 'var(--rule)' }}>
        <div className="mx-auto flex max-w-[1400px] flex-wrap items-center gap-3">
          {SURFACES.map((s) => {
            const locked = s.id === 'report' && !reportReady;
            return (
              <button
                key={s.id}
                onClick={() => setSurface(s.id)}
                disabled={locked}
                title={locked ? `Opens once the model has read session ${newest?.session_index ?? ''}` : undefined}
                className="rounded-lg px-5 py-2.5 text-base transition-colors"
                style={{
                  background: surface === s.id ? 'var(--ink)' : 'transparent',
                  color: locked ? 'var(--muted)' : surface === s.id ? 'var(--paper)' : 'var(--ink)',
                  border: `1px solid ${surface === s.id ? 'var(--ink)' : 'var(--rule)'}`,
                  cursor: locked ? 'not-allowed' : 'pointer',
                  opacity: locked ? 0.6 : 1,
                }}
              >
                {s.label}
              </button>
            );
          })}
          <span className="ml-4 text-sm" style={{ color: 'var(--muted)' }}>
            {active.note}
          </span>
          <button
            onClick={onReset}
            disabled={resetting}
            className="ml-auto rounded-lg px-3 py-1.5 text-sm"
            style={{ color: 'var(--muted)', border: '1px solid var(--rule)' }}
          >
            {resetting ? 'Resetting…' : 'Reset demo'}
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-[1400px] px-8 py-8">
        {error && (
          <p className="mb-6 rounded-lg p-3 text-sm" style={{ background: '#fff1f1', color: '#8a2c2c' }}>
            {error}
          </p>
        )}
        {/* All three stay mounted and are hidden rather than removed. A model run
            takes a minute; switching tab while it runs must not drop the run, the
            open session, or labels not yet saved. */}
        {!state ? (
          <p className="text-sm" style={{ color: 'var(--muted)' }}>
            Loading…
          </p>
        ) : (
          <div key={generation}>
            <div hidden={surface !== 'annotate'}>
              <Annotate />
            </div>
            <div hidden={surface !== 'report'}>
              <Report />
            </div>
            <div hidden={surface !== 'internal'}>
              <Internal />
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export function App() {
  return (
    <WorkspaceProvider>
      <Shell />
    </WorkspaceProvider>
  );
}
