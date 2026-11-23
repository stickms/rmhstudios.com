/**
 * A small seeded PRNG (mulberry32). Every random choice in a Cursed Logic run goes through one of these, so a run is
 * reproducible from its seed and the balance simulation (`__tests__/balance.test.ts`) is deterministic.
 */
import { shuffle as coreShuffle } from '@/lib/core/rng';

export interface Rng {
  /** A float in [0, 1). */
  next(): number;
  /** The internal state, for saving a run. */
  readonly state: number;
}

export function createRng(seed: number): Rng {
  let s = seed >>> 0 || 0x9e3779b9;
  return {
    next() {
      s = (s + 0x6d2b79f5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
    get state() {
      return s;
    },
  };
}

/** An integer in [0, n). */
export function randInt(rng: Rng, n: number): number {
  return Math.floor(rng.next() * n);
}

/** One element of a non-empty list. */
export function pick<T>(rng: Rng, list: readonly T[]): T {
  const v = list[randInt(rng, list.length)];
  if (v === undefined) throw new Error('pick: empty list');
  return v;
}

/** A shuffled copy, drawn from `rng`. */
export function shuffled<T>(rng: Rng, list: readonly T[]): T[] {
  return coreShuffle(list, () => rng.next());
}

/** A fresh seed for a new run (not for anything that must be reproducible). */
export function freshSeed(): number {
  return (Math.random() * 0xffffffff) >>> 0;
}
