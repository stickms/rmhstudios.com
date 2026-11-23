/**
 * A tiny seeded PRNG (mulberry32) whose whole state is one 32-bit number, so it lives inside the run state and
 * survives a save. Every random draw in the engine goes through here; nothing calls Math.random.
 */

export interface Rng {
  /** Current state; write it back into the run after drawing. */
  s: number;
}

/** Next float in [0, 1). Mutates `r.s`. */
export function next(r: Rng): number {
  r.s = (r.s + 0x6d2b79f5) | 0;
  let t = r.s;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** Integer in [lo, hi] inclusive. */
export function int(r: Rng, lo: number, hi: number): number {
  return lo + Math.floor(next(r) * (hi - lo + 1));
}

export function pick<T>(r: Rng, items: readonly T[]): T {
  if (items.length === 0) throw new Error('pick from empty list');
  return items[Math.floor(next(r) * items.length)] as T;
}

/** Weighted pick: `weights[i]` is the weight of `items[i]`. */
export function pickWeighted<T>(r: Rng, items: readonly T[], weights: readonly number[]): T {
  const total = weights.reduce((a, b) => a + b, 0);
  let roll = next(r) * total;
  for (let i = 0; i < items.length; i++) {
    roll -= weights[i] ?? 0;
    if (roll < 0) return items[i] as T;
  }
  return items[items.length - 1] as T;
}

/** Fisher-Yates, returning a new array. */
export function shuffled<T>(r: Rng, items: readonly T[]): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(next(r) * (i + 1));
    const tmp = out[i] as T;
    out[i] = out[j] as T;
    out[j] = tmp;
  }
  return out;
}

/** `n` distinct items (fewer when the list is short). */
export function sample<T>(r: Rng, items: readonly T[], n: number): T[] {
  return shuffled(r, items).slice(0, n);
}

/** A fresh seed from a wall clock (the UI's only source of entropy for a new run). */
export function seedFrom(n: number): number {
  return (Math.imul(n ^ 0x9e3779b9, 0x85ebca6b) ^ (n >>> 13)) >>> 0;
}
