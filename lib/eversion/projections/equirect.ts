/**
 * Equirectangular / plate carrée (spec §5.1, §5.3, §1.1-6) — the plain texture
 * wrap. OWNER: T04.
 *
 * `x = θ`, `y = φ`. Width ↔ 360° of longitude when `A = H/W ≤ 0.5`, which
 * leaves `φ_max = π·A`. A taller page cannot fit width to 360° (a 9:19.5 phone
 * page would need 390° of latitude), so above `A = 0.5` the policy switches —
 * EXACTLY at 0.5 — to height ↔ 180° with the width covering `360°/(2A)` of
 * longitude, centred on the front; the remaining back gore is glass.
 *
 * The switch is continuous: at `A = 0.5` both policies give `halfW = π`,
 * `halfH = π/2`, so the page never jumps when a window is resized across it —
 * only the fit's `policy` label changes. The comparison is `A <= 0.5` on the
 * float `h/w`, so a 1000 × 500 viewport is `'width'` and 1000 × 501 `'height'`.
 *
 * ## `extended()` (spec §5.5)
 *
 * `u = 0.5 + θ/(2·lonHalf)` and `v = 0.5 − φ/(2·phiMax)` with θ wrapped into
 * `(−π, π]`, linear past the page: under `'width'` `u ∈ [0, 1]` always and the
 * polar caps continue `v` past 0/1; under `'height'` the gore continues `u`
 * past 0/1 (up to `0.5 ± A` at the back meridian) and `v ∈ [0, 1]`. Clamping to
 * `[0, 1]²` is the nearest page-edge pixel. Always finite, clamped to
 * `±LUT_UV_EXTENT` beyond the page.
 *
 * Fit shape: {@link EquirectFit} (its `policy` records which side of 0.5 it is
 * on). Tests: S#1, S#4.
 */

import { LUT_UV_EXTENT } from '../constants';
import { PHI_MAX, PHI_MIN, THETA_MAX, THETA_MIN, wrapTheta } from '../domain';
import type { EquirectFit, FitParams, Projection } from '../types';

/** See `mercator.ts`: the neighbourhood the tests exclude, applied inside `singular()`. */
const SINGULAR_EPS = 1e-3;

function fit(w: number, h: number): EquirectFit {
  const aspect = Math.max(h, 1) / Math.max(w, 1);
  const policy = aspect <= 0.5 ? 'width' : 'height';
  const lonHalf = policy === 'width' ? Math.PI : Math.PI / (2 * aspect);
  const phiMax = policy === 'width' ? Math.PI * aspect : Math.PI / 2;
  // In this projection's plane (x = θ, y = φ) the page half-extents ARE the
  // longitude/latitude half-spans.
  return { kind: 'equirect', aspect, halfW: lonHalf, halfH: phiMax, policy, lonHalf, phiMax };
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
  const f = fitParams as EquirectFit;
  const u = 0.5 + wrapTheta(theta) / (2 * f.lonHalf);
  const v = 0.5 - phi / (2 * f.phiMax);
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
  const f = fitParams as EquirectFit;
  out[offset] = clampExt(0.5 + wrapTheta(theta) / (2 * f.lonHalf));
  out[offset + 1] = clampExt(0.5 - phi / (2 * f.phiMax));
}

function inverse(
  u: number,
  v: number,
  fitParams: FitParams,
  out: Float64Array,
  offset = 0,
): boolean {
  const f = fitParams as EquirectFit;
  if (!(u >= 0 && u <= 1 && v >= 0 && v <= 1)) return false;
  out[offset] = Math.min(THETA_MAX, Math.max(THETA_MIN, (u - 0.5) * 2 * f.lonHalf));
  out[offset + 1] = Math.min(PHI_MAX, Math.max(PHI_MIN, (0.5 - v) * 2 * f.phiMax));
  return true;
}

function singular(theta: number, phi: number, fitParams: FitParams): boolean {
  const f = fitParams as EquirectFit;
  // The glass caps / back gore (plus a hair) and, under 'width', the seam —
  // which is the page edge at θ = ±lonHalf = ±π, so one test covers both.
  return (
    Math.abs(phi) >= f.phiMax - SINGULAR_EPS ||
    Math.abs(wrapTheta(theta)) >= f.lonHalf - SINGULAR_EPS
  );
}

export const equirect: Projection = { id: 'equirect', fit, forward, extended, inverse, singular };
