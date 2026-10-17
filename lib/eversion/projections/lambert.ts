/**
 * Lambert azimuthal equal-area (spec §5.1, §5.3). OWNER: T05.
 *
 * Equal-area azimuthal about the front point. The page's CORNERS sit on the
 * projection's bounding circle (radius 2 for the unit sphere), so the whole
 * page reaches the back point and the page "closes around the globe into a
 * single point"; the four lens-shaped gaps between the page edges and the
 * circle are glass.
 *
 * ## The map
 *
 * With `d = (cos φ sin θ, sin φ)` and `z = cos φ cos θ` as in
 * `stereographic.ts`:
 *
 *     (X, Y) = d · sqrt(2 / (1 + z))      ρ = 2·sin(γ/2) ∈ [0, 2]
 *     inverse: z = 1 − ρ²/2,   d = (X, Y) · sqrt(1 − ρ²/4)
 *
 * Plane area equals sphere area, so `det ∂(X, Y)/∂(θ, φ) = cos φ` exactly (S#3).
 * The page is `|X| ≤ halfW`, `|Y| ≤ halfH` with the corners on the circle:
 * `halfW² + halfH² = 4`, `halfH = A·halfW`, hence `halfW = 2/√(1 + A²)`. The
 * page therefore covers `4·halfW·halfH / 4π = 4A / (π(1 + A²))` of the sphere
 * (≤ 63.7 %, at 1:1).
 *
 * Only the four page CORNERS touch the circle, i.e. the back pole; that is the
 * singular point (the whole circle is one sphere point, so the map is
 * discontinuous in direction there). `1 + z` is computed cancellation-free as
 * in `stereographic.ts`.
 *
 * ## `extended()` (spec §5.5)
 *
 * The same formula outside the page: the lens gaps are the part of the disc
 * ρ ≤ 2 beyond the page edges, so a glass point sits just past the edge it
 * borders and clamping to `[0, 1]²` lands on the nearest page-edge pixel. The
 * map's image is bounded by the disc, so values are finite without help
 * (`|u − 0.5| ≤ 1/halfW`, 1.25 on the tallest phone page; the clamp to
 * `±LUT_UV_EXTENT` is belt and braces). At the back pole itself the limit depends on
 * the direction of approach; `extended()` returns the point of the circle in
 * the direction of the point's own `d` (or +x at the exact pole, where `d`
 * underflows) — finite, never NaN.
 *
 * Fit shape: {@link LambertFit}. Tests: S#1, S#3 (`det J / cos φ` constant to
 * 1e-6), S#4.
 */

import { LUT_UV_EXTENT } from '../constants';
import { PHI_MAX, PHI_MIN, THETA_MAX, THETA_MIN } from '../domain';
import type { FitParams, LambertFit, Projection } from '../types';
import { nearBackPole, onePlusZ } from './stereographic';

/** Radius of the bounding circle for the unit sphere: `2·sin(π/2)`. */
const CIRCLE_RADIUS = 2;

function fit(w: number, h: number): LambertFit {
  const aspect = Math.max(h, 1) / Math.max(w, 1);
  const halfW = CIRCLE_RADIUS / Math.sqrt(1 + aspect * aspect);
  return {
    kind: 'lambert',
    aspect,
    halfW,
    halfH: halfW * aspect,
    circleRadius: CIRCLE_RADIUS,
  };
}

function clampExt(x: number): number {
  return Math.max(-LUT_UV_EXTENT, Math.min(1 + LUT_UV_EXTENT, x));
}

/** Plane coordinates `(X, Y)` (Y up) of `(θ, φ)`, into `scratch`. Finite for all inputs. */
function plane(theta: number, phi: number, scratch: Float64Array): void {
  const dx = Math.cos(phi) * Math.sin(theta);
  const dy = Math.sin(phi);
  const opz = onePlusZ(theta, phi);
  if (opz < 1e-300) {
    // Exact back pole: the limit is the bounding circle in the direction of d.
    const d = Math.hypot(dx, dy);
    scratch[0] = d > 1e-300 ? (CIRCLE_RADIUS * dx) / d : CIRCLE_RADIUS;
    scratch[1] = d > 1e-300 ? (CIRCLE_RADIUS * dy) / d : 0;
    return;
  }
  const k = Math.sqrt(2 / opz);
  scratch[0] = k * dx;
  scratch[1] = k * dy;
}

const scratch = new Float64Array(2);

function forward(
  theta: number,
  phi: number,
  fitParams: FitParams,
  out: Float64Array,
  offset = 0,
): boolean {
  const f = fitParams as LambertFit;
  plane(theta, phi, scratch);
  const u = 0.5 + scratch[0]! / (2 * f.halfW);
  const v = 0.5 - scratch[1]! / (2 * f.halfH);
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
  const f = fitParams as LambertFit;
  plane(theta, phi, scratch);
  out[offset] = clampExt(0.5 + scratch[0]! / (2 * f.halfW));
  out[offset + 1] = clampExt(0.5 - scratch[1]! / (2 * f.halfH));
}

function inverse(
  u: number,
  v: number,
  fitParams: FitParams,
  out: Float64Array,
  offset = 0,
): boolean {
  const f = fitParams as LambertFit;
  if (!(u >= 0 && u <= 1 && v >= 0 && v <= 1)) return false;
  const X = (u - 0.5) * 2 * f.halfW;
  const Y = (0.5 - v) * 2 * f.halfH;
  const rho2 = X * X + Y * Y;
  // Corners sit exactly on ρ = 2; rounding may push them a hair over.
  const s = Math.sqrt(Math.max(0, 1 - rho2 / 4));
  const dx = X * s;
  const dy = Y * s;
  const z = 1 - rho2 / 2;
  out[offset] = Math.min(THETA_MAX, Math.max(THETA_MIN, Math.atan2(dx, z)));
  out[offset + 1] = Math.min(PHI_MAX, Math.max(PHI_MIN, Math.atan2(dy, Math.hypot(dx, z))));
  return true;
}

function singular(theta: number, phi: number, _fit: FitParams): boolean {
  return nearBackPole(theta, phi);
}

export const lambert: Projection = { id: 'lambert', fit, forward, extended, inverse, singular };
