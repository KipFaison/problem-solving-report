// The agreement wrapper (SPEC-gate0 §5.4, docs/DEVIATIONS.md D-023).
//
// This is the only call site of the two vendored Sandpiper files. They are
// copied verbatim and are not edited, so the inputs they answer with a number
// they should not answer are refused here instead. Both were re-read in the
// copy before this was written:
//   - `calculateCohensKappa.ts:6` returns 0 when the two sequences differ in
//     length, which reads as chance agreement rather than as misalignment;
//   - `:37` returns 1 when expected agreement is 1, which happens exactly when
//     a single code appears across both sequences — a perfect score although
//     no disagreement was ever possible.
//
// A refusal is a result carrying a reason, never a number. Nothing here
// repairs, clamps, rounds or adjusts a value the vendored function does
// return, and nothing here composes a sentence for a reader.
import calculateCohensKappa from '../../vendor/sandpiper/calculateCohensKappa.ts';
import getKappaInterpretation from '../../vendor/sandpiper/getKappaInterpretation.ts';
import { config } from '../config.ts';

/** The refusals of §5.4. Names match `Agreement['refusal']['reason']`. */
export type KappaRefusalReason =
  | 'length_mismatch'
  | 'degenerate_single_code'
  | 'too_few_turns';

export type KappaResult =
  | { measured: true; value: number; band: string; n_turns: number }
  | {
      measured: false;
      reason: KappaRefusalReason;
      detail: string;
      /** The compared length, when there was one. Null when the two disagree. */
      n_turns: number | null;
    };

/**
 * Cohen's κ over two per-turn label sequences, or a refusal.
 *
 * `a` and `b` are positionally aligned: index i is the same turn under each
 * run's tiling. Producing that alignment is the caller's job (gate.ts); the
 * only part of it this function can check is that the lengths match.
 */
/**
 * `scope` picks which floor applies. 'pooled' is the figure the gate acts on and
 * keeps the higher floor; 'session' is one session's figure, shown internally as
 * a working aid, and a session is never long enough to clear the pooled floor.
 */
export function agreementKappa(a: string[], b: string[], scope: 'pooled' | 'session' = 'pooled', minimumOverride?: number): KappaResult {
  if (a.length !== b.length) {
    return {
      measured: false,
      reason: 'length_mismatch',
      detail: `label sequences differ in length: first ${a.length} turns, second ${b.length} turns`,
      n_turns: null,
    };
  }

  const n = a.length;
  // Another layer counts items, not turns, and passes its own floor.
  const minimum =
    minimumOverride !== undefined
      ? minimumOverride
      : scope === 'session' ? config.agreement.minTurnsForSessionAgreement : config.agreement.minTurnsForAgreement;

  // Checked before degeneracy: below the minimum there is nothing to
  // characterise, and an empty comparison reported as "a single code" would be
  // wrong on its face. §5.4 lists the three conditions without an order.
  // [OURS: the order of the checks, not the conditions.]
  if (n < minimum) {
    return {
      measured: false,
      reason: 'too_few_turns',
      detail: `${n} turns compared; the minimum is ${minimum}`,
      n_turns: n,
    };
  }

  const single: string[] = [];
  if (new Set(a).size < 2) single.push('first sequence');
  if (new Set(b).size < 2) single.push('second sequence');
  if (single.length > 0) {
    return {
      measured: false,
      reason: 'degenerate_single_code',
      detail: `a single code across all ${n} turns (${single.join(', ')}): no disagreement was possible`,
      n_turns: n,
    };
  }

  const value = calculateCohensKappa(a, b);
  return { measured: true, value, band: getKappaInterpretation(value), n_turns: n };
}
