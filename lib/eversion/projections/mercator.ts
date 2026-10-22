/**
 * Mercator (spec §5.1, §5.3) — the "world map" wrap. OWNER: T04.
 *
 * Conformal cylindrical, at TRUE SCALE (amended 2026-10-19). The owner: "the
 * middle is so big … I want the page to look more normal". Spreading the page's
 * width over 360° of longitude, as this used to, put a 960 px page on a globe
 * 528 px across at 1.7× its own size in the middle, and the WRAP zoomed into the
 * page to get there. Now the page is laid on the globe at the size it has on
 * screen: one page px per screen px at the front point, where the eversion
 * globe (radius `GLOBE_RADIUS_FRACTION · min(W, H)`) is magnified `globeK(1)`
 * by its perspective, so
 *
 *     halfW = min(π, (W/2) / (GLOBE_RADIUS_FRACTION · min(W, H) · globeK(1)))
 *
 * radians of longitude, and the page's height keeps the same scale
 * (`halfH = A · halfW`, conformal end to end: shapes are kept, only the sphere's
 * own foreshortening and the gentle `sec φ` growth toward the caps change them).
 * On a landscape screen the page is then about the front hemisphere; the
 * centre neither grows nor shrinks as the page wraps. `φ_max = atan(sinh(halfH))`.
 * Everything beyond the page is glass: the caps beyond `φ_max` and the back gore
 * `|θ| > halfW` (closed only on a screen wider than ≈ 3.4:1, where `halfW`
 * reaches π and the page edges meet on the back meridian, `θ = ±π`, the mesh
 * seam: `domain.ts`).
 *
 * ## Why these formulas
 *
 * - `y = asinh(tan φ)` rather than `ln tan(π/4 + φ/2)`: the same function, but
 *   finite all the way to `φ = ±π/2` (`tan(π/2)` is 1.6e16 in doubles, not ∞),
 *   which is what lets {@link extended} be total without a special case at the
 *   poles. The inverse is the Gudermannian `atan(sinh y)`, which — unlike
 *   `2·atan(e^y) − π/2` — does not lose the latitude to cancellation next to
 *   the pole on a tall page.
 * - Page UV is `u = 0.5 + θ/(2·halfW)`, `v = 0.5 − y/(2·halfH)` (`v` down, north up).
 *
 * ## `extended()` (spec §5.5)
 *
 * `u` and `v` are the SAME linear functions of `θ` (wrapped into `(−π, π]`) and
 * `y` past the page edges, so a glass point in a polar cap sits straight
 * above/below the page edge it belongs to, one in the back gore straight beside
 * it, and clamping to `[0, 1]²` lands on the nearest page-edge pixel. Both are
 * clamped to `±LUT_UV_EXTENT` beyond the page; at the poles themselves
 * `y ≈ ±37`, so the value is finite (and clamped) rather than infinite. There
 * is no NaN path. The gore's two halves meet at the seam, where `u` jumps from
 * past the right edge to past the left: the mesh duplicates that column, so no
 * triangle spans it.
 *
 * Fit shape: {@link MercatorFit}. Tests: S#1, S#2, S#4.
 */

import { GLOBE_RADIUS_FRACTION, LUT_UV_EXTENT } from '../constants';
import { globeK } from '../../globe';
import { PHI_MAX, PHI_MIN, THETA_MAX, THETA_MIN, wrapTheta } from '../domain';
import type { FitParams, MercatorFit, Projection } from '../types';

/**
 * Angular margin (rad) `singular()` keeps around the glass caps and the seam —
 * the 1e-3 neighbourhood the S#1/S#2 tests exclude, applied here so the tests
 * need not know each projection's geometry.
 */
const SINGULAR_EPS = 1e-3;

/** The latitude where a page of half-height `halfH` (Mercator `y` units) ends: the Gudermannian `atan(sinh y)`. */
export function mercatorPhiMax(halfH: number): number {
  return Math.atan(Math.sinh(halfH));
}

/**
 * The page's half-width in radians of longitude at true scale (module docblock):
 * one page px per screen px at the front point of the eversion globe, capped at π.
 */
export function mercatorHalfWidth(w: number, h: number): number {
  const radius = GLOBE_RADIUS_FRACTION * Math.min(w, h);
  return Math.min(Math.PI, w / 2 / (radius * globeK(1)));
}

function fit(w: number, h: number): MercatorFit {
  // A degenerate (0 × 0) viewport must not poison the LUT bake with NaN.
  const W = Math.max(w, 1);
  const H = Math.max(h, 1);
  const aspect = H / W;
  const halfW = mercatorHalfWidth(W, H);
  const halfH = halfW * aspect;
  return { kind: 'mercator', aspect, halfW, halfH, phiMax: mercatorPhiMax(halfH) };
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
  out[offset] = Math.min(THETA_MAX, Math.max(THETA_MIN, (u - 0.5) * 2 * f.halfW));
  out[offset + 1] = Math.min(PHI_MAX, Math.max(PHI_MIN, Math.atan(Math.sinh(y))));
  return true;
}

function singular(theta: number, phi: number, fitParams: FitParams): boolean {
  const f = fitParams as MercatorFit;
  // Glass caps and the back gore (plus a hair), and the seam where u jumps across the back.
  const lon = Math.abs(wrapTheta(theta));
  return (
    Math.abs(phi) >= f.phiMax - SINGULAR_EPS ||
    lon >= f.halfW - SINGULAR_EPS ||
    lon >= Math.PI - SINGULAR_EPS
  );
}

export const mercator: Projection = { id: 'mercator', fit, forward, extended, inverse, singular };
