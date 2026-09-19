// The planted episode plan: the shape a session is generated from.
//
// A plan is not a labelling and nothing is ever scored against it (SPEC §8).
// It is kept beside the session so a reader can see what the transcript was
// built to contain.
import type { ComposedCode } from '../codebook/load.ts';
import type { Prng } from './prng.ts';

export interface PlannedEpisode {
  code: string;
  turns: number;
}

/** A tiling: consecutive spans covering every turn of a session exactly once. */
export type Tiling = PlannedEpisode[];

// [OURS: an arc, not a finding. Sessions open on reading and close on checking
// the answer because that is a recognisable shape for a tutoring session, not
// because a source says sessions are distributed this way. The weights govern
// how often a code is planted; a code the codebook adds later and this table
// does not name still gets planted, at DEFAULT_WEIGHT.]
const WEIGHTS: Record<string, number> = {
  reading: 0.06,
  analysis: 0.2,
  planning: 0.15,
  implementation: 0.24,
  exploration: 0.12,
  verification: 0.1,
  monitor: 0.06,
  organization: 0.06,
  writing: 0.07,
  digression: 0.06,
};
const DEFAULT_WEIGHT = 0.05;

const OPENING_CODE = 'reading';
const CLOSING_CODES = ['verification', 'monitor'];

// [OURS: a session does not check an answer before there is one to check, so
// verification is held back until implementation has been planted. Ordering,
// not definition: no source says episodes must come in this order.]
const NOT_BEFORE: Record<string, string> = { verification: 'implementation' };

const MAX_EPISODE_TURNS = 8;

/** Below this the arc above does not fit; a shorter session is a caller bug. */
const MIN_SESSION_TURNS = 12;

function lengthFor(code: ComposedCode, rng: Prng): number {
  // Talk that is not problem-solving work tends to be shorter than work.
  return code.content_related ? rng.int(3, MAX_EPISODE_TURNS) : rng.int(1, 3);
}

function available(code: ComposedCode, planted: ReadonlySet<string>): boolean {
  const prerequisite = NOT_BEFORE[code.code];
  return prerequisite === undefined || planted.has(prerequisite);
}

function nextCode(
  codes: readonly ComposedCode[],
  previous: string,
  planted: ReadonlySet<string>,
  rng: Prng,
): ComposedCode {
  const choices = codes.filter((entry) => entry.code !== previous && available(entry, planted));
  return rng.pickWeighted(choices, (entry) => WEIGHTS[entry.code] ?? DEFAULT_WEIGHT);
}

function named(codes: readonly ComposedCode[], code: string): ComposedCode | undefined {
  return codes.find((entry) => entry.code === code);
}

/**
 * Plants a tiling of exactly `turnBudget` turns. Adjacent episodes never carry
 * the same code: two touching spans of one code are one episode, not two.
 */
export function plantPlan(codes: readonly ComposedCode[], turnBudget: number, rng: Prng): Tiling {
  if (codes.length < 2) throw new Error('A plan needs at least two codes to alternate between');
  if (turnBudget < MIN_SESSION_TURNS) {
    throw new Error(`A planted plan needs at least ${MIN_SESSION_TURNS} turns, got ${turnBudget}`);
  }

  const closingTurns = rng.int(3, 6);
  const bodyBudget = turnBudget - closingTurns;

  const opening = named(codes, OPENING_CODE) ?? codes[0]!;
  const plan: Tiling = [{ code: opening.code, turns: rng.int(2, 4) }];
  const planted = new Set<string>([opening.code]);
  let used = plan[0]!.turns;

  while (bodyBudget - used > MAX_EPISODE_TURNS) {
    const code = nextCode(codes, plan[plan.length - 1]!.code, planted, rng);
    const turns = lengthFor(code, rng);
    plan.push({ code: code.code, turns });
    planted.add(code.code);
    used += turns;
  }

  // Whatever the loop left over is one more body episode, so the plan tiles
  // the budget exactly rather than approximately.
  if (bodyBudget - used > 0) {
    const code = nextCode(codes, plan[plan.length - 1]!.code, planted, rng);
    plan.push({ code: code.code, turns: bodyBudget - used });
    planted.add(code.code);
  }

  // Chosen after the body, so a closing code with a prerequisite is only used
  // once the body has planted it.
  const closingChoices = CLOSING_CODES.map((code) => named(codes, code)).filter(
    (entry) => entry !== undefined && available(entry, planted),
  );
  const closing = closingChoices.length > 0 ? rng.pick(closingChoices) : undefined;
  const last = plan[plan.length - 1]!;
  if (closing === undefined || closing.code === last.code) last.turns += closingTurns;
  else plan.push({ code: closing.code, turns: closingTurns });

  return plan;
}

/** Cumulative end index (1-based, inclusive) of each episode. */
export function boundaries(tiling: Tiling): number[] {
  const ends: number[] = [];
  let running = 0;
  for (const episode of tiling) {
    running += episode.turns;
    ends.push(running);
  }
  return ends;
}

export function totalTurns(tiling: Tiling): number {
  return tiling.reduce((sum, episode) => sum + episode.turns, 0);
}

/** One code per turn, in turn order. The form agreement is computed over. */
export function turnLabels(tiling: Tiling): string[] {
  return tiling.flatMap((episode) => Array<string>(episode.turns).fill(episode.code));
}
