// A seeded pseudo-random generator, so a demo set regenerates byte-identically.
//
// The algorithm is mulberry32, by Tommy Ettinger (2017), public domain (CC0).
//
// [OURS: mulberry32. Chosen because it is ten lines and needs no dependency
// (CLAUDE.md VIII). Nothing here needs statistical quality beyond "varied
// enough to read as dialogue"; what it does need is that the same seed gives
// the same demo every time, or the sets change under everyone's feet and
// nothing downstream is reproducible.]
export class Prng {
  #state: number;

  constructor(seed: number) {
    this.#state = seed >>> 0;
  }

  /** Uniform in [0, 1). */
  next(): number {
    let t = (this.#state += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Uniform integer in [min, max], both inclusive. */
  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }

  chance(probability: number): boolean {
    return this.next() < probability;
  }

  pick<T>(items: readonly T[]): T {
    const item = items[this.int(0, items.length - 1)];
    if (item === undefined) throw new Error('Prng.pick called on an empty list');
    return item;
  }

  /** Picks by weight. Weights need not sum to 1. */
  pickWeighted<T>(items: readonly T[], weightOf: (item: T) => number): T {
    const total = items.reduce((sum, item) => sum + weightOf(item), 0);
    if (total <= 0) throw new Error('Prng.pickWeighted called with no positive weight');
    let roll = this.next() * total;
    for (const item of items) {
      roll -= weightOf(item);
      if (roll <= 0) return item;
    }
    return items[items.length - 1] as T;
  }
}
