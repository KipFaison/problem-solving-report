// The live workspace: what the site reads and writes while someone is using it.
//
// Files on disk, under data/live, written through this module and nothing else
// (PLAN P2). A session, an annotation run and a model run each live in their
// own file, so saving one annotation rewrites one file.
import { readJson, writeJson, exists, listJson } from '../storage/index.ts';
import { config } from '../config.ts';
import { computeAgreement } from '../agreement/gate.ts';
import type { Agreement, Episode, MovesMarks, Report, Run, RunShown, Session } from '../contract/types.ts';
import type { MoveItem } from '../moves/items.ts';

const ROOT = 'data/live';

/**
 * A session id becomes part of a file name, so it is checked before it gets
 * anywhere near one: letters, digits, hyphens and underscores only. Without
 * this, an id like `../x` writes outside the workspace.
 */
export const SESSION_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;

export function assertSessionId(id: string): void {
  if (!SESSION_ID.test(id)) {
    throw new Error(`"${id}" is not a usable session id: letters, digits, hyphens and underscores only`);
  }
}

const sessionPath = (id: string) => {
  assertSessionId(id);
  return `${ROOT}/sessions/${id}.json`;
};
const runPath = (id: string, kind: 'human' | 'llm') => {
  assertSessionId(id);
  return `${ROOT}/runs/${id}.${kind}.json`;
};
/** Layer 2's tutor marks: their own file, apart from the episode annotation. */
const movesPath = (id: string) => {
  assertSessionId(id);
  return `${ROOT}/runs/${id}.moves.json`;
};

export function sessionExists(id: string): boolean {
  return SESSION_ID.test(id) && exists(`${ROOT}/sessions/${id}.json`);
}

export interface StoredRun extends Run {
  episodes: Episode[];
}

export interface WorkspaceFile {
  student_id: string;
  session_ids: string[];
  data_provenance: { status: 'synthetic' | 'authentic'; ui_label: string };
  /**
   * Sessions that arrived annotated and read by the model, locked on the tutor
   * side for the demo: no transcript text served, no annotation saved, no model
   * run (SPEC D19). Written by scripts/seed-live.ts. Absent means none is locked,
   * as in a workspace seeded before the lock existed. [OURS: docs/DEVIATIONS.md]
   */
  locked_session_ids?: string[];
}

export function loadWorkspace(): WorkspaceFile {
  return readJson<WorkspaceFile>(`${ROOT}/workspace.json`);
}

/** Whether a session is locked for the demo (SPEC D19). */
export function isLocked(sessionId: string): boolean {
  return (loadWorkspace().locked_session_ids ?? []).includes(sessionId);
}

export function saveWorkspace(w: WorkspaceFile): void {
  writeJson(`${ROOT}/workspace.json`, w);
}

export function workspaceExists(): boolean {
  return exists(`${ROOT}/workspace.json`);
}

export function loadSession(id: string): Session {
  return readJson<Session>(sessionPath(id));
}

export function saveSession(session: Session): void {
  writeJson(sessionPath(session.session_id), session);
}

export function listSessions(): Session[] {
  const w = loadWorkspace();
  return w.session_ids.filter((id) => exists(sessionPath(id))).map(loadSession);
}

export function loadRun(sessionId: string, kind: 'human' | 'llm'): StoredRun | null {
  const path = runPath(sessionId, kind);
  return exists(path) ? readJson<StoredRun>(path) : null;
}

export function saveRun(sessionId: string, run: StoredRun): void {
  writeJson(runPath(sessionId, run.kind === 'human' ? 'human' : 'llm'), run);
}

/**
 * Layer 2's labels written onto the model run's episodes that are items
 * (docs/SPEC-layer2.md). `labels` maps a preceding turn id to one of the five
 * layer codes; an item whose preceding turn is not the tutor's gets a null
 * move. Every other episode loses any tutor_prompting it carried, so a label
 * never outlives the item it was for. Returns a new run; the caller saves it.
 */
export function withTutorPrompting(
  run: StoredRun,
  items: MoveItem[],
  labels: Map<string, string>,
  movesCodebookVersion: string,
): StoredRun {
  const byEpisode = new Map(items.map((item) => [item.episode_id, item]));
  const episodes = run.episodes.map((episode) => {
    const { tutor_prompting: _stale, ...rest } = episode;
    const item = byEpisode.get(episode.episode_id);
    if (!item) return rest;
    const move = item.classifiable ? labels.get(item.preceding_turn.turn_id) : undefined;
    if (item.classifiable && move === undefined) {
      throw new Error(`${episode.episode_id}: no label for tutor turn ${item.preceding_turn.turn_id}`);
    }
    return {
      ...rest,
      tutor_prompting: {
        preceding_turn_id: item.preceding_turn.turn_id,
        preceding_speaker: item.preceding_turn.role,
        tutor_move: move ?? null,
        codebook_version: movesCodebookVersion,
      },
    };
  });
  return { ...run, episodes };
}

export function loadMovesMarks(sessionId: string): MovesMarks | null {
  const path = movesPath(sessionId);
  return exists(path) ? readJson<MovesMarks>(path) : null;
}

export function saveMovesMarks(marks: MovesMarks): void {
  writeJson(movesPath(marks.session_id), marks);
}

export function hasRuns(sessionId: string): { annotated: boolean; modelled: boolean } {
  return {
    annotated: exists(runPath(sessionId, 'human')),
    modelled: exists(runPath(sessionId, 'llm')),
  };
}

export function loadReport(): Report | null {
  return exists(`${ROOT}/report.json`) ? readJson<Report>(`${ROOT}/report.json`) : null;
}

export function saveReport(report: Report): void {
  writeJson(`${ROOT}/report.json`, report);
}

export function clearReport(): void {
  if (exists(`${ROOT}/report.json`)) writeJson(`${ROOT}/report.json`, null);
}

/** Every stored file, for the odd case of listing what is there. */
export function allRunFiles(): string[] {
  return listJson(`${ROOT}/runs`);
}

/**
 * The `shown` record of an annotation run pooled over several sessions, so the
 * gate reads one list of shown turns: each session's own list, or every turn
 * of a session whose run records none. Undefined when no run records one, so
 * a pool of runs saved before D18 is exactly what it was.
 *
 * [OURS: `sampling` is kept only when every sampled session was drawn with the
 * same settings, and is null otherwise; the per-session record on each run
 * file stays the authoritative one.]
 */
export function pooledShown(pairs: Array<{ session: Session; human: Run }>): RunShown | undefined {
  if (pairs.every(({ human }) => !human.shown)) return undefined;
  const samplings = pairs.flatMap(({ human }) => (human.shown?.mode === 'sample' ? [human.shown.sampling] : []));
  const first = samplings[0] ?? null;
  const same = samplings.every(
    (s) => s?.problems_per_session === first?.problems_per_session && s?.seed === first?.seed,
  );
  return {
    mode: samplings.length > 0 ? 'sample' : 'whole_session',
    turn_ids: pairs.flatMap(({ session, human }) =>
      human.shown
        ? human.shown.turn_ids
        : [...session.turns].sort((x, y) => x.sequence_id - y.sequence_id).map((t) => t.turn_id),
    ),
    problem_ids: pairs.flatMap(({ session, human }) =>
      human.shown ? human.shown.problem_ids : (session.problems ?? []).map((p) => p.problem_id),
    ),
    sampling: same ? first : null,
  };
}

/**
 * Agreement over the sessions that carry both an annotation run and a model
 * run: one figure per session, and one pooled over all of them. Recomputed
 * whenever an annotation is saved, which is why re-annotating an old session
 * changes the figure without the model running again.
 */
export function computeWorkspaceAgreement(): Agreement {
  const sessions = listSessions();
  const paired = sessions.filter((s) => {
    const r = hasRuns(s.session_id);
    return r.annotated && r.modelled;
  });
  // The pooled figure only pools sessions whose two runs share a codebook
  // version; a mismatched session is refused on its own line instead.
  const comparable = paired.filter((s) => {
    const h = loadRun(s.session_id, 'human');
    const l = loadRun(s.session_id, 'llm');
    return h !== null && l !== null && h.codebook_version === l.codebook_version;
  });

  const perSession: NonNullable<Agreement['per_session']> = paired.map((session) => {
    const human = loadRun(session.session_id, 'human');
    const llm = loadRun(session.session_id, 'llm');
    if (!human || !llm) {
      return {
        session_id: session.session_id,
        session_index: session.session_index,
        value: null,
        band: null,
        n_turns: null,
        state: 'unmeasured' as const,
        refusal: { reason: 'no_annotation_run' as const, detail: 'no pair for this session' },
      };
    }
    // Two runs labelled under different codebook versions are not comparable:
    // a code can mean something different, or not exist, in one of them (§4).
    if (human.codebook_version !== llm.codebook_version) {
      return {
        session_id: session.session_id,
        session_index: session.session_index,
        value: null,
        band: null,
        n_turns: null,
        state: 'unmeasured' as const,
        refusal: {
          reason: 'codebook_version_mismatch' as const,
          detail: `annotation under codebook ${human.codebook_version}, model run under ${llm.codebook_version}; annotate or generate again under one version`,
        },
      };
    }
    const one = computeAgreement({
      scope: 'session',
      sessions: [session],
      annotationRun: { run: human, episodes: human.episodes },
      llmRun: { run: llm, episodes: llm.episodes },
    });
    return {
      session_id: session.session_id,
      session_index: session.session_index,
      value: one.value,
      band: one.band,
      n_turns: one.n_turns,
      state: one.state,
      refusal: one.refusal,
    };
  });

  if (comparable.length === 0) {
    return {
      threshold: config.agreement.threshold,
      statistic: "Cohen's kappa",
      unit: 'turn',
      compared_runs: null,
      n_turns: null,
      value: null,
      band: null,
      measured: false,
      state: 'unmeasured',
      simulated: false,
      refusal: {
        reason: 'no_annotation_run',
        detail: 'no session carries both an annotation run and a model run',
      },
      statement: '',
      per_session: [],
    };
  }

  // Pooled: every paired session's turns in one comparison, which is what the
  // report's gate acts on.
  const humanEpisodes: Episode[] = [];
  const llmEpisodes: Episode[] = [];
  let humanRun: Run | null = null;
  let llmRun: Run | null = null;
  let simulated = false;
  const shownPairs: Array<{ session: Session; human: Run }> = [];

  for (const session of comparable) {
    const human = loadRun(session.session_id, 'human');
    const llm = loadRun(session.session_id, 'llm');
    if (!human || !llm) continue;
    humanEpisodes.push(...human.episodes);
    llmEpisodes.push(...llm.episodes);
    shownPairs.push({ session, human });
    humanRun ??= human;
    llmRun ??= llm;
    if (human.simulated) simulated = true;
  }

  if (!humanRun || !llmRun) throw new Error('paired sessions with no runs');

  // The first run is only a template: its own `shown` would restrict every
  // session to the first session's turns, so the pooled record replaces it.
  const pooled = computeAgreement({
    sessions: comparable,
    annotationRun: {
      run: { ...humanRun, run_id: 'annotation-runs', shown: pooledShown(shownPairs) ?? null },
      episodes: humanEpisodes,
    },
    llmRun: { run: { ...llmRun, run_id: 'model-runs' }, episodes: llmEpisodes },
  });

  return { ...pooled, simulated, per_session: perSession };
}
