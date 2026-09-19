// Which turns of a step are quoted, the same rule in both evidence panels: the
// timeline strip's (app/Report.tsx `Detail`) and the diagram's
// (app/Schematic.tsx `Said`).
import type { Episode, Report, Run, Session, Turn } from '../src/contract/types.ts';
import { isStudent } from '../src/moves/items.ts';
import { NOT_PROBLEM_SOLVING, comparableCode } from './data.ts';

/** At most this many quotes per step. [OURS: docs/DEVIATIONS.md] */
export const QUOTES_PER_STEP = 3;

/** src/moves/codebook.ts `NO_PROMPT`, repeated because that module reads the
 *  disk and cannot be bundled. */
const NO_PROMPT = 'NONE';

/** The label on the one quote that may carry the star (owner's wording,
 *  2026-09-18). [OURS: docs/DEVIATIONS.md D-032] */
export const KEY_MOVE_LABEL = 'Key move';

/**
 * The report's plain descriptions of what was done in an exchange, keyed by
 * the turn_id of the quote they sit under: `Report.quote_descriptions`, which
 * is optional and written on the server. Only non-empty strings are kept, so a
 * missing field, a missing key or an empty value all show nothing.
 */
export function descriptionsOf(report: Report): Record<string, string> {
  const all = (report as Report & { quote_descriptions?: unknown }).quote_descriptions;
  if (typeof all !== 'object' || all === null) return {};
  const kept: Record<string, string> = {};
  for (const [turnId, text] of Object.entries(all)) {
    if (typeof text === 'string' && text.trim() !== '') kept[turnId] = text;
  }
  return kept;
}

/** The report's two runs, found by kind, as `changesSince` in app/Report.tsx
 *  finds them. Either is null when the report carries no run of that kind. */
export interface Readings {
  human: string | null;
  llm: string | null;
}

export const readingsOf = (runs: Run[]): Readings => ({
  human: runs.find((r) => r.kind === 'human')?.run_id ?? null,
  llm: runs.find((r) => r.kind === 'llm')?.run_id ?? null,
});

/** One run's episode code for each turn it covers, by turn_id. */
function coverage(session: Session, runId: string): Map<string, string> {
  const position = new Map(session.turns.map((t, i) => [t.turn_id, i]));
  const byTurn = new Map<string, string>();
  for (const e of session.annotations ?? []) {
    if (e.run_id !== runId) continue;
    const from = position.get(e.start_turn_id);
    const to = position.get(e.end_turn_id);
    if (from === undefined || to === undefined) continue;
    for (const t of session.turns.slice(from, to + 1)) byTurn.set(t.turn_id, e.EPISODE);
  }
  return byTurn;
}

/**
 * The turns of this session where the tutor's annotation and the model's
 * reading put the turn in the same one of the six classes of
 * src/agreement/gate.ts: the five problem-solving codes, and
 * `NOT_PROBLEM_SOLVING` for a turn the tutor left unmarked or the model coded
 * outside those five. A turn the model's run does not cover is never agreed: a
 * gap there is an error, not that class. Empty when either run has no episode
 * in this session, as the gate leaves such a session out of its pool.
 */
function agreedTurns(session: Session, readings: Readings): Set<string> {
  if (readings.human === null || readings.llm === null) return new Set();
  const human = coverage(session, readings.human);
  const llm = coverage(session, readings.llm);
  if (human.size === 0 || llm.size === 0) return new Set();
  const agreed = new Set<string>();
  for (const t of session.turns) {
    const l = llm.get(t.turn_id);
    if (l === undefined) continue;
    const h = human.get(t.turn_id);
    const a = h === undefined ? NOT_PROBLEM_SOLVING : comparableCode(h);
    if (a === comparableCode(l)) agreed.add(t.turn_id);
  }
  return agreed;
}

/**
 * The student's turn that opens this step, when it may carry the star: the
 * step's episode has Layer 2's NONE on it and that layer's own agreement is
 * `shown`. Only a model run's episodes carry `tutor_prompting`, so a report
 * built from an annotation run never stars. The same condition as the clause
 * `openingLine` adds in app/Schematic.tsx. Null otherwise.
 */
export function starredOpener(session: Session, episode: Episode, movesShown: boolean): string | null {
  if (!movesShown || episode.tutor_prompting?.tutor_move !== NO_PROMPT) return null;
  const opener = session.turns.find((t) => t.turn_id === episode.start_turn_id);
  return opener !== undefined && isStudent(opener.role) ? opener.turn_id : null;
}

/**
 * At most `QUOTES_PER_STEP` of a step's turns, by one rule for every step:
 * turns both readings put in the same class first; within that, the student's
 * turns before the tutor's; then turn order. Fewer agreed turns than the limit
 * are filled from the rest in the same order, so a step with turns always has
 * quotes. A starred opener is always among them. Returned in transcript order,
 * so the quotes read as a conversation.
 * [OURS: a selection applied uniformly by agreement is a reliability filter,
 * not a choice of the most telling lines. docs/DEVIATIONS.md]
 */
export function chooseQuotes(
  session: Session,
  turns: Turn[],
  readings: Readings,
  starred: string | null,
): Turn[] {
  const agreed = agreedTurns(session, readings);
  const order = new Map(turns.map((t, i) => [t.turn_id, i]));
  const rank = (t: Turn): number[] => [
    t.turn_id === starred ? 0 : 1,
    agreed.has(t.turn_id) ? 0 : 1,
    isStudent(t.role) ? 0 : 1,
    order.get(t.turn_id) ?? 0,
  ];
  const byRank = (x: Turn, y: Turn): number => {
    const a = rank(x);
    const b = rank(y);
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return (a[i] ?? 0) - (b[i] ?? 0);
    return 0;
  };
  return [...turns]
    .sort(byRank)
    .slice(0, QUOTES_PER_STEP)
    .sort((x, y) => (order.get(x.turn_id) ?? 0) - (order.get(y.turn_id) ?? 0));
}
