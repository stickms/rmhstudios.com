/**
 * Seeded randomness for the arc system (docs/plans/plasmatic-jelly/03-arcs.md §6.1).
 *
 * Every random choice an arc makes — when it fires, which pair, where it lands, the shape of the bolt — comes from a
 * seeded stream, so tests are deterministic and a re-strike can regenerate "the same path with new detail" from
 * `seed + k`. Nothing here reads `Math.random` or a clock.
 *
 * The generator is mulberry32, the same algorithm `lib/dream-rift/rng.ts` and `lib/laundry-sort/rng.ts` use. It is
 * restated here rather than imported because every existing copy lives inside a game's module, and site chrome must
 * not depend on a game directory (games are deleted and rewritten on their own schedule).
 */

/** A source of uniform numbers in [0, 1). */
export type Rand = () => number;

/** mulberry32: a fast 32-bit seeded generator, uniform in [0, 1). */
export function mulberry32(seed: number): Rand {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Mix two integers into a well-spread 32-bit seed (`seed`, `salt` → a fresh independent stream). */
export function mixSeed(seed: number, salt: number): number {
  let h = (seed >>> 0) ^ Math.imul(salt >>> 0, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}

/** Uniform in [lo, hi). */
export function randRange(rand: Rand, lo: number, hi: number): number {
  return lo + (hi - lo) * rand();
}

/** Integer uniform in [lo, hi] inclusive. */
export function randInt(rand: Rand, lo: number, hi: number): number {
  return lo + Math.floor(rand() * (hi - lo + 1));
}

/** −1 or +1. */
export function randSign(rand: Rand): number {
  return rand() < 0.5 ? -1 : 1;
}

/** Exponential with rate `lambda` (mean `1/lambda`); `Infinity` when the rate is 0. */
export function randExp(rand: Rand, lambda: number): number {
  if (!(lambda > 0)) return Infinity;
  return -Math.log(1 - rand()) / lambda;
}
