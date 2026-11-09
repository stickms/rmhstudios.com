/**
 * The one seeded RNG. `mulberry32` is bit-for-bit the Node reference that the
 * Go doctrine worker replicates (go-services/internal/doctrine/seed.go) —
 * changing it breaks daily-puzzle parity. Do not edit the arithmetic.
 */

/** Deterministic PRNG in [0, 1). Same seed → same sequence, on every platform. */
export function mulberry32(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Fisher-Yates shuffle returning a NEW array (the input is never mutated).
 * Pass a seeded `rand` (e.g. `mulberry32(seed)`) for a reproducible order.
 */
export function shuffle<T>(arr: readonly T[], rand: () => number = Math.random): T[] {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}
