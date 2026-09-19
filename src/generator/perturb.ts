// The simulated annotation run: the planted plan with controlled noise.
//
// The noise is on the annotation side because that is the side a real tutor
// would supply (SPEC §8). Two knobs — where a boundary lands, and what a span
// is called — because those are the two ways two people reading the same
// session disagree.
//
// [EXTRAPOLATION: this is not a model of how a person disagrees. Boundary
// error is uniform and independent here, and real annotators' disagreements
// cluster on the hard spans and confuse particular pairs of codes. What would
// test it: two people coding the same real session, and comparing their
// confusion matrix with the one these parameters produce. Until then a demo
// kappa says the gate works, and nothing about how a person would have
// labelled those turns.]
import type { ComposedCode } from '../codebook/load.ts';
import { boundaries, totalTurns, type Tiling } from './plan.ts';
import type { Prng } from './prng.ts';

export interface NoiseParams {
  /** Chance that an interior boundary moves at all. */
  boundaryShiftProbability: number;
  /** Largest move, in turns, in either direction. */
  maxBoundaryShift: number;
  /** Chance that a span keeps its extent but is called something else. */
  relabelProbability: number;
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(Math.max(value, low), high);
}

/** Two touching spans of one code are one episode, not two. */
function mergeAdjacent(tiling: Tiling): Tiling {
  const merged: Tiling = [];
  for (const episode of tiling) {
    const previous = merged[merged.length - 1];
    if (previous !== undefined && previous.code === episode.code) previous.turns += episode.turns;
    else merged.push({ ...episode });
  }
  return merged;
}

/**
 * Returns a tiling of the same turns as `plan`: same first turn, same last
 * turn, no gaps and no overlaps. Only the interior boundaries and the labels
 * move.
 */
export function perturb(
  plan: Tiling,
  codes: readonly ComposedCode[],
  noise: NoiseParams,
  rng: Prng,
): Tiling {
  const turns = totalTurns(plan);
  const ends = boundaries(plan);
  const count = ends.length;

  for (let index = 0; index < count - 1; index++) {
    const shift = rng.chance(noise.boundaryShiftProbability)
      ? rng.int(1, noise.maxBoundaryShift) * (rng.chance(0.5) ? -1 : 1)
      : 0;
    // Every episode keeps at least one turn, and the ones after this still
    // need one each, so the tiling survives any shift.
    const previousEnd = index === 0 ? 0 : ends[index - 1]!;
    ends[index] = clamp(ends[index]! + shift, previousEnd + 1, turns - (count - 1 - index));
  }

  const shifted: Tiling = [];
  for (let index = 0; index < count; index++) {
    const previousEnd = index === 0 ? 0 : ends[index - 1]!;
    shifted.push({ code: plan[index]!.code, turns: ends[index]! - previousEnd });
  }

  const relabelled = shifted.map((episode) => {
    if (!rng.chance(noise.relabelProbability)) return episode;
    const alternatives = codes.filter((entry) => entry.code !== episode.code);
    return { code: rng.pick(alternatives).code, turns: episode.turns };
  });

  return mergeAdjacent(relabelled);
}
