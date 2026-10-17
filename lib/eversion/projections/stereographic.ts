/**
 * Stereographic from the back pole (spec §5.1, §5.3) — the shrink-wrap.
 * OWNER: T05.
 *
 * Conformal azimuthal. The page is centred on the front tangent plane and
 * scaled so its HALF-WIDTH subtends 150° from the front point; the back cap
 * (and, on tall pages, the region beyond the short sides) is glass, and the
 * page "puckers into one point behind". The back pole is the singular point.
 *
 * ## The map
 *
 * Project from the back pole `(0, 0, −1)` onto the plane tangent at the front.
 * With `d = (cos φ sin θ, sin φ)` (the point's screen-plane components, y UP)
 * and `z = cos φ cos θ`:
 *
 *     (X, Y) = 2·d / (1 + z)            ρ = 2·tan(γ/2),  γ = angle from front
 *     inverse: z = (4 − ρ²)/(4 + ρ²),   d = 4·(X, Y)/(4 + ρ²)
 *
 * The page is `|X| ≤ halfW`, `|Y| ≤ halfH` with `halfW = 2·tan(150°/2)` and
 * `halfH = A·halfW`, i.e. a uniformly scaled rectangle (conformal end to end).
 * Note a tall page reaches further from the front along the y axis than along
 * x: the 9:19.5 corner is 166° from the front. No page point is ever the back
 * pole itself, so the page is finite everywhere it exists.
 *
 * ## Numerics
 *
 * `1 + z` is the one quantity that vanishes (at the back pole), so it is
 * computed as `2·sin²(φ/2) + 2·cos φ·cos²(θ/2)` — a sum of non-negative terms,
 * exact to relative 1e-16 right up to the pole, where `1 + cos φ cos θ` would
 * cancel to zero. The inverse takes `φ = atan2(d_y, hypot(d_x, z))` rather
 * than `asin`, which loses half its digits next to the poles.
 *
 * ## `extended()` (spec §5.5)
 *
 * The same formula evaluated where the page does not cover — the plane
 * continues to infinity, so glass points sit radially OUTSIDE the page in the
 * direction they came from, and clamping to `[0, 1]²` gives the nearest
 * page-edge pixel of the pucker. Each of `u, v` is clamped to
 * `[−LUT_UV_EXTENT, 1 + LUT_UV_EXTENT]`. At the back pole `(X, Y)` is
 * infinite and its direction is undefined: `extended()` returns the clamped
 * limit along the point's own `d` direction, or along +x when `d` underflows
 * (the exact pole) — finite, never NaN. Neighbouring texels around the pole
 * therefore wind round the clamp box once; that is inherent to a
 * pole-projection and is what the vertex shader's clamp collapses.
 *
 * Fit shape: {@link StereographicFit}. Tests: S#1, S#2, S#4.
 */

import { LUT_UV_EXTENT } from '../constants';
import { PHI_MAX, PHI_MIN, THETA_MAX, THETA_MIN } from '../domain';
import type { FitParams, Projection, StereographicFit } from '../types';

/** The half-angle (rad) the page's half-width subtends from the front point (spec §5.3). */
export const STEREOGRAPHIC_HALF_ANGLE = (150 * Math.PI) / 180;

/** Angular margin (rad) around the back pole that `singular()` reports. */
export const AZIMUTHAL_SINGULAR_EPS = 1e-3;

/**
 * `1 + cos φ cos θ` without the cancellation at the back pole (see module
 * docblock). Exported for `lambert.ts`, which has the same singular point.
 */
export function onePlusZ(theta: number, phi: number): number {
  const sp = Math.sin(phi / 2);
  const ct = Math.cos(theta / 2);
  return 2 * sp * sp + 2 * Math.cos(phi) * ct * ct;
}

/**
 * Whether `(θ, φ)` is within {@link AZIMUTHAL_SINGULAR_EPS} of the back pole
 * (`1 + z ≤ 1 − cos ε`). Shared by both azimuthal projections.
 */
export function nearBackPole(theta: number, phi: number): boolean {
  return onePlusZ(theta, phi) <= 1 - Math.cos(AZIMUTHAL_SINGULAR_EPS);
}

function fit(w: number, h: number): StereographicFit {
  const aspect = Math.max(h, 1) / Math.max(w, 1);
  const halfW = 2 * Math.tan(STEREOGRAPHIC_HALF_ANGLE / 2);
  return {
    kind: 'stereographic',
    aspect,
    halfW,
    halfH: halfW * aspect,
    halfAngle: STEREOGRAPHIC_HALF_ANGLE,
  };
}

function clampExt(x: number): number {
  return Math.max(-LUT_UV_EXTENT, Math.min(1 + LUT_UV_EXTENT, x));
}

/** Un-clamped page UV of `(θ, φ)`; `forward` and `extended` share it so they agree bit for bit. */
function pageUV(theta: number, phi: number, f: StereographicFit, out: Float64Array): void {
  const dx = Math.cos(phi) * Math.sin(theta);
  const dy = Math.sin(phi);
  const k = 2 / Math.max(onePlusZ(theta, phi), 1e-300);
  let u = 0.5 + (k * dx) / (2 * f.halfW);
  let v = 0.5 - (k * dy) / (2 * f.halfH);
  if (!Number.isFinite(u) || !Number.isFinite(v)) {
    // Only reachable at the exact pole where k·d is 0·∞ territory: take the
    // direction of d (or +x) at the clamp.
    const d = Math.hypot(dx, dy);
    u = 0.5 + (d > 1e-300 ? dx / d : 1) * 1e6;
    v = 0.5 - (d > 1e-300 ? dy / d : 0) * 1e6;
  }
  out[0] = u;
  out[1] = v;
}

const scratch = new Float64Array(2);

function forward(
  theta: number,
  phi: number,
  fitParams: FitParams,
  out: Float64Array,
  offset = 0,
): boolean {
  pageUV(theta, phi, fitParams as StereographicFit, scratch);
  const u = scratch[0]!;
  const v = scratch[1]!;
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
  pageUV(theta, phi, fitParams as StereographicFit, scratch);
  out[offset] = clampExt(scratch[0]!);
  out[offset + 1] = clampExt(scratch[1]!);
}

function inverse(
  u: number,
  v: number,
  fitParams: FitParams,
  out: Float64Array,
  offset = 0,
): boolean {
  const f = fitParams as StereographicFit;
  if (!(u >= 0 && u <= 1 && v >= 0 && v <= 1)) return false;
  const X = (u - 0.5) * 2 * f.halfW;
  const Y = (0.5 - v) * 2 * f.halfH;
  const rho2 = X * X + Y * Y;
  const s = 4 / (4 + rho2);
  const dx = X * s;
  const dy = Y * s;
  const z = (4 - rho2) / (4 + rho2);
  out[offset] = Math.min(THETA_MAX, Math.max(THETA_MIN, Math.atan2(dx, z)));
  out[offset + 1] = Math.min(PHI_MAX, Math.max(PHI_MIN, Math.atan2(dy, Math.hypot(dx, z))));
  return true;
}

function singular(theta: number, phi: number, _fit: FitParams): boolean {
  return nearBackPole(theta, phi);
}

export const stereographic: Projection = {
  id: 'stereographic',
  fit,
  forward,
  extended,
  inverse,
  singular,
};
