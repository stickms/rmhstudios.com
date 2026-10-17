/**
 * Mercator (spec §5.1, §5.3) — the "world map" wrap. OWNER: T04.
 *
 * Conformal cylindrical. Width ↔ 360° of longitude; latitude follows the
 * aspect: with `A = H/W` the page spans `y = ln tan(π/4 + φ/2) ∈ [−πA, πA]`, so
 * `φ_max = 2·atan(e^{π·A}) − π/2` (70.6° at 16:9, ≈ 89.9° at 9:19.5). The caps
 * beyond `φ_max` are glass. The page's left/right edges meet on the back
 * meridian (`θ = ±π`), which is also the mesh seam (`domain.ts`).
 *
 * ## Why these formulas
 *
 * - `y = asinh(tan φ)` rather than `ln tan(π/4 + φ/2)`: the same function, but
 *   finite all the way to `φ = ±π/2` (`tan(π/2)` is 1.6e16 in doubles, not ∞),
 *   which is what lets {@link extended} be total without a special case at the
 *   poles. The inverse is the Gudermannian `atan(sinh y)`, which — unlike
 *   `2·atan(e^y) − π/2` — does not lose the latitude to cancellation next to
 *   the pole on a tall page.
 * - Page UV is `u = 0.5 + θ/2π`, `v = 0.5 − y/(2πA)` (`v` down, north up).
 *
 * ## `extended()` (spec §5.5)
 *
 * `u` is always the page's own `0.5 + θ/2π ∈ [0, 1]` (θ is wrapped into
 * `(−π, π]`), and `v` is the SAME linear function of `y` past the page edge, so
 * a glass point in a polar cap sits straight above/below the page edge it
 * belongs to and clamping to `[0, 1]²` lands on the nearest page-edge pixel.
 * `v` is clamped to `±LUT_UV_EXTENT` beyond the page; at the poles themselves
 * `y ≈ ±37`, so the value is finite (and clamped) rather than infinite. There
 * is no NaN path.
 *
 * Fit shape: {@link MercatorFit}. Tests: S#1, S#2, S#4.
 */

import { LUT_UV_EXTENT } from '../constants';
import { PHI_MAX, PHI_MIN, TAU, THETA_MAX, THETA_MIN, wrapTheta } from '../domain';
import type { FitParams, MercatorFit, Projection } from '../types';

/**
 * Angular margin (rad) `singular()` keeps around the glass caps and the seam —
 * the 1e-3 neighbourhood the S#1/S#2 tests exclude, applied here so the tests
 * need not know each projection's geometry.
 */
const SINGULAR_EPS = 1e-3;

/** `φ_max = 2·atan(e^{π·A}) − π/2`, spec §5.3. */
export function mercatorPhiMax(aspect: number): number {
  return 2 * Math.atan(Math.exp(Math.PI * aspect)) - Math.PI / 2;
}

function fit(w: number, h: number): MercatorFit {
  // A degenerate (0 × 0) viewport must not poison the LUT bake with NaN.
  const aspect = Math.max(h, 1) / Math.max(w, 1);
  return {
    kind: 'mercator',
    aspect,
    halfW: Math.PI,
    halfH: Math.PI * aspect,
    phiMax: mercatorPhiMax(aspect),
  };
}

function clampExt(x: number): number {
  return Math.max(-LUT_UV_EXTENT, Math.min(1 + LUT_UV_EXTENT, x));
}

function forward(
  theta: number,
  phi: number,
  fitParams: FitParams,
  out: Float64Array,
  offset = 0,
): boolean {
  const f = fitParams as MercatorFit;
  const u = 0.5 + wrapTheta(theta) / (2 * f.halfW);
  const v = 0.5 - Math.asinh(Math.tan(phi)) / (2 * f.halfH);
  if (!(u >= 0 && u <= 1 && v >= 0 && v <= 1)) return false;
  out[offset] = u;
  out[offset + 1] = v;
  return true;
}

function extended(
  theta: number,
  phi: number,
  fitParams: FitParams,
  out: Float64Array,
  offset = 0,
): void {
  const f = fitParams as MercatorFit;
  out[offset] = clampExt(0.5 + wrapTheta(theta) / (2 * f.halfW));
  out[offset + 1] = clampExt(0.5 - Math.asinh(Math.tan(phi)) / (2 * f.halfH));
}

function inverse(
  u: number,
  v: number,
  fitParams: FitParams,
  out: Float64Array,
  offset = 0,
): boolean {
  const f = fitParams as MercatorFit;
  if (!(u >= 0 && u <= 1 && v >= 0 && v <= 1)) return false;
  const y = (0.5 - v) * 2 * f.halfH;
  out[offset] = Math.min(THETA_MAX, Math.max(THETA_MIN, (u - 0.5) * TAU));
  out[offset + 1] = Math.min(PHI_MAX, Math.max(PHI_MIN, Math.atan(Math.sinh(y))));
  return true;
}

function singular(theta: number, phi: number, fitParams: FitParams): boolean {
  const f = fitParams as MercatorFit;
  // Glass caps (plus a hair), and the page-edge seam where u jumps 0 ↔ 1.
  return (
    Math.abs(phi) >= f.phiMax - SINGULAR_EPS || Math.abs(wrapTheta(theta)) >= Math.PI - SINGULAR_EPS
  );
}

export const mercator: Projection = { id: 'mercator', fit, forward, extended, inverse, singular };
