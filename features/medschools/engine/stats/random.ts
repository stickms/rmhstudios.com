/** Seeded noise and quantiles. The same seed always gives the same draws, so a re-run the same day changes nothing. */

import { mulberry32 } from '@/lib/core/rng';

/** The repo's one seeded RNG (redesign audit A4), re-exported so callers import the stats surface only. */
export { mulberry32 };

/** 32-bit FNV-1a of the UTF-16 code units (inputs are ASCII ids and dates). */
export function fnv1a(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Knuth below 30, a rounded normal (Box-Muller) above; never below 0 and never NaN. */
export function poisson(lambda: number, rnd: () => number): number {
  if (!(lambda > 0) || !Number.isFinite(lambda)) return 0;
  if (lambda < 30) {
    const limit = Math.exp(-lambda);
    let k = 0;
    let p = 1;
    do {
      k++;
      p *= rnd();
    } while (p > limit);
    return k - 1;
  }
  const u1 = Math.max(rnd(), Number.MIN_VALUE);
  const u2 = rnd();
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return Math.max(0, Math.round(lambda + Math.sqrt(lambda) * z));
}

/** Type 7 (linear interpolation) quantile of an ascending array; 0 for an empty one. */
export function quantile(sorted: readonly number[], q: number): number {
  const n = sorted.length;
  if (n === 0) return 0;
  const pos = Math.min(1, Math.max(0, q)) * (n - 1);
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  const a = sorted[lo] ?? 0;
  const b = sorted[hi] ?? a;
  return a + (b - a) * (pos - lo);
}
