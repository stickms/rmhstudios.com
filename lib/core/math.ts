/**
 * Core numeric primitives. The one home for `clamp` / `clamp01` / `lerp` —
 * an ESLint rule (`no-restricted-syntax`, eslint.config.mjs) stops new local
 * copies from appearing.
 */

/**
 * Clamp `v` into `[lo, hi]`. Argument order is (value, lo, hi).
 *
 * Contract: callers pass `lo <= hi`. If `lo > hi` the result is `lo` for
 * `v < lo` and `hi` otherwise (a deterministic but meaningless answer — the
 * bounds are not swapped). NaN in → NaN out (it is not coerced to a bound).
 */
export const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);

/** Clamp into `[0, 1]`. NaN in → NaN out. */
export const clamp01 = (v: number): number => clamp(v, 0, 1);

/** Linear interpolation; `t` is NOT clamped (extrapolates outside 0..1). */
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/** Inverse of `lerp`: where `v` sits between `a` and `b`. 0 when `a === b`. */
export const invLerp = (a: number, b: number, v: number): number => (a === b ? 0 : (v - a) / (b - a));

/** Re-map `v` from `[a0, a1]` to `[b0, b1]` (unclamped). */
export const remap = (v: number, a0: number, a1: number, b0: number, b1: number): number =>
  lerp(b0, b1, invLerp(a0, a1, v));
