/**
 * The engine's only source of randomness.
 *
 * `Math.random()` is banned everywhere under `lib/bums-rush/`: the boil (§2.3)
 * samples noise per vertex per frame and a global generator would make the ink
 * line *hiss* rather than wobble, and the host's sim has to replay identically
 * for the same seed when a level is retried. Every consumer takes a stream of
 * its own via `fork()` so that adding one draw in the drone code cannot shift
 * the splat sprites — the classic way seeded systems rot.
 *
 * This buys single-machine reproducibility only. Cross-machine determinism is
 * explicitly NOT a goal (§3.7) — matter.js is not bit-reproducible and the
 * netcode is host-authoritative so that it never has to be.
 */

export interface Rng {
  /** Uniform in [0, 1). */
  next(): number;
  /** Uniform integer in [0, n). */
  int(n: number): number;
  /** Uniform in [lo, hi). */
  range(lo: number, hi: number): number;
  pick<T>(items: readonly T[]): T;
  /** A child stream. Draws here never advance the parent. */
  fork(salt: number): Rng;
}

/** FNV-1a — turns a level id into a stable numeric seed. */
export function hashSeed(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** mulberry32: 32 bits of state, no allocation per draw, good enough for juice. */
export function createRng(seed: number): Rng {
  let state = seed >>> 0;

  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  return {
    next,
    int: (n) => Math.floor(next() * n),
    range: (lo, hi) => lo + next() * (hi - lo),
    pick: (items) => items[Math.floor(next() * items.length)],
    fork: (salt) => createRng((seed ^ Math.imul(salt + 1, 0x9e3779b1)) >>> 0),
  };
}

/**
 * A pure noise sample — the boil needs the *same* offset for the same
 * (vertexId, frameBucket) forever, which a stateful stream cannot give it.
 */
export function noise2(seed: number, a: number, b: number): number {
  let h = seed ^ Math.imul(a | 0, 0x27d4eb2d) ^ Math.imul(b | 0, 0x165667b1);
  h = Math.imul(h ^ (h >>> 15), h | 1);
  h ^= h + Math.imul(h ^ (h >>> 7), h | 61);
  return ((h ^ (h >>> 14)) >>> 0) / 4294967296;
}
