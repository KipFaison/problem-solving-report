// What a tutor is shown of a session: one or more whole problems, drawn at
// random with a seed (INTENT.md, "What a tutor is shown"; docs/SPEC-gate0.md
// D18). The settings live in config/gate0.json under `sampling` and nowhere
// else.
//
// The draw decides what a tutor reads, not what the report covers: the model
// run still reads the whole session.
import type { Session } from '../contract/types.ts';
import type { Gate0Config } from '../config.ts';
import { Prng } from '../generator/prng.ts';

/** The problems drawn from one session, and the turns they span. */
export interface SampleView {
  /** The drawn problems, in session order. */
  problem_ids: string[];
  /** Every turn of the drawn problems, start to end inclusive, in session order. */
  turn_ids: string[];
  /** How many problems the session marks. */
  problems_total: number;
  problems_per_session: number;
  /**
   * The seed from config, not the per-session number derived from it: the
   * draw is repeated from this, the session_id and the problems.
   */
  seed: number;
}

/**
 * The config seed and the session_id as one 32-bit seed, so each session draws
 * independently while the whole draw stays repeatable. [OURS: FNV-1a, because
 * it is a few lines and needs no dependency (CLAUDE.md VIII). Nothing here
 * needs a strong hash, only that the same inputs give the same number.]
 */
export function sessionSeed(seed: number, sessionId: string): number {
  let hash = (0x811c9dc5 ^ seed) >>> 0;
  for (let i = 0; i < sessionId.length; i++) {
    hash ^= sessionId.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash;
}

/**
 * The problems a tutor is shown of this session, or null when the tutor is
 * shown the whole of it: sampling is off, the session marks fewer than two
 * problems (every uploaded transcript), or the draw would take every problem
 * anyway.
 */
export function drawSample(session: Session, cfg: Pick<Gate0Config, 'sampling'>): SampleView | null {
  const { enabled, problemsPerSession, seed } = cfg.sampling;
  if (!enabled) return null;
  if (!Number.isInteger(problemsPerSession) || problemsPerSession < 1) {
    throw new Error(`config sampling.problemsPerSession is ${problemsPerSession}; it must be a whole number, 1 or more`);
  }
  const problems = session.problems ?? [];
  if (problems.length < 2 || problemsPerSession >= problems.length) return null;

  const turns = [...session.turns].sort((x, y) => x.sequence_id - y.sequence_id);
  const positionOf = new Map(turns.map((turn, i) => [turn.turn_id, i]));
  const spans = problems.map((problem) => {
    const start = positionOf.get(problem.start_turn_id);
    const end = positionOf.get(problem.end_turn_id);
    if (start === undefined || end === undefined || start > end) {
      throw new Error(
        `${session.session_id}: problem ${problem.problem_id} spans ${problem.start_turn_id}..${problem.end_turn_id}, ` +
          `which is not a run of this session's turns`,
      );
    }
    return { problem_id: problem.problem_id, start, end };
  });
  spans.sort((x, y) => x.start - y.start);

  // Without replacement: a partial Fisher-Yates over the problems' positions,
  // then back into session order so the tutor reads them as they happened.
  const prng = new Prng(sessionSeed(seed, session.session_id));
  const order = spans.map((_, i) => i);
  for (let i = 0; i < problemsPerSession; i++) {
    const j = prng.int(i, order.length - 1);
    [order[i], order[j]] = [order[j] as number, order[i] as number];
  }
  const chosen = order
    .slice(0, problemsPerSession)
    .sort((x, y) => x - y)
    .map((i) => spans[i] as (typeof spans)[number]);

  return {
    problem_ids: chosen.map((span) => span.problem_id),
    turn_ids: chosen.flatMap((span) => turns.slice(span.start, span.end + 1).map((turn) => turn.turn_id)),
    problems_total: problems.length,
    problems_per_session: problemsPerSession,
    seed,
  };
}
