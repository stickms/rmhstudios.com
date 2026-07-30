/**
 * Laundry Sort — seeded PRNG.
 *
 * Multiplayer fairness rests on this: every client in a match builds the same
 * drop schedule from the same 32-bit seed, so nobody gets an easier stream of
 * garments than the person they are racing. `Math.random()` must never appear
 * anywhere in the schedule or the physics.
 *
 * mulberry32 — small, fast, and well-distributed enough for gameplay. Not
 * cryptographic, and nothing here needs it to be.
 */

export interface Rng {
  /** Uniform in [0, 1). */
  next(): number;
  /** Uniform in [min, max). */
  range(min: number, max: number): number;
  /** Uniform integer in [0, n). */
  int(n: number): number;
  /** Uniform element. Throws on an empty list rather than returning undefined. */
  pick<T>(items: readonly T[]): T;
}

export function createRng(seed: number): Rng {
  // Force to uint32 so a negative or fractional seed still gives a clean stream.
  let a = seed >>> 0;

  const next = (): number => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  return {
    next,
    range: (min, max) => min + next() * (max - min),
    int: (n) => Math.floor(next() * n),
    pick: (items) => {
      if (items.length === 0) throw new Error('pick() from an empty list');
      return items[Math.floor(next() * items.length)];
    },
  };
}

/** A fresh seed for a new match. Only the host calls this. */
export function randomSeed(): number {
  return (Math.random() * 0xffffffff) >>> 0;
}
