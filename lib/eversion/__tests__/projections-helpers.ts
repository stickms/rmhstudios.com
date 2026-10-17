/**
 * Local helpers for the T04/T05 projection tests (the orchestrator may later
 * dedupe these with the shared `helpers.ts`).
 *
 * Every helper that scans a grid returns the FIRST counter-example (or `null`)
 * so a test asserts once per property instead of calling `expect()` per sample.
 */

import { PHI_MAX, PHI_MIN, THETA_MIN, TAU, spherePoint, wrapTheta } from '../domain';
import type { FitParams, Projection } from '../types';

/** The six aspects of S#4, as page `W : H`. */
export const ASPECTS: ReadonlyArray<{ name: string; w: number; h: number }> = [
  { name: '9:19.5', w: 900, h: 1950 },
  { name: '3:4', w: 750, h: 1000 },
  { name: '1:1', w: 800, h: 800 },
  { name: '16:10', w: 1600, h: 1000 },
  { name: '16:9', w: 1600, h: 900 },
  { name: '21:9', w: 2100, h: 900 },
];

/** Midpoint grid over the chart: `cols × rows` cells, visited as `(θ, φ)` cell centres. */
export function forEachCell(
  cols: number,
  rows: number,
  visit: (theta: number, phi: number, cosPhi: number) => void,
): void {
  for (let j = 0; j < rows; j++) {
    const phi = PHI_MIN + ((j + 0.5) / rows) * (PHI_MAX - PHI_MIN);
    const cosPhi = Math.cos(phi);
    for (let i = 0; i < cols; i++) {
      visit(THETA_MIN + ((i + 0.5) / cols) * TAU, phi, cosPhi);
    }
  }
}

/** Euclidean distance between the sphere points of two chart positions (seam-safe). */
export function sphereDistance(t1: number, p1: number, t2: number, p2: number): number {
  const a = new Float64Array(3);
  const b = new Float64Array(3);
  spherePoint(t1, p1, a);
  spherePoint(t2, p2, b);
  return Math.hypot(a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!);
}

/**
 * Round-trip `inverse(forward(p))` over a `cols × rows` grid, skipping glass
 * and the singular neighbourhood. Returns the worst sphere-distance error, the
 * first offender (if over `tol`) and how many cells were actually exercised.
 */
export function roundTrip(
  proj: Projection,
  fit: FitParams,
  cols: number,
  rows: number,
  tol: number,
): { checked: number; worst: number; first: string | null } {
  const uv = new Float64Array(2);
  const back = new Float64Array(2);
  let checked = 0;
  let worst = 0;
  let first: string | null = null;
  forEachCell(cols, rows, (theta, phi) => {
    if (proj.singular(theta, phi, fit)) return;
    if (!proj.forward(theta, phi, fit, uv)) return;
    if (!proj.inverse(uv[0]!, uv[1]!, fit, back)) {
      first ??= `inverse refused covered point θ=${theta} φ=${phi}`;
      return;
    }
    checked++;
    const err = sphereDistance(theta, phi, back[0]!, back[1]!);
    if (err > worst) worst = err;
    if (err > tol && first === null) first = `θ=${theta} φ=${phi} → err ${err}`;
  });
  return { checked, worst, first };
}

/**
 * The forward Jacobian of the plane coordinates `(x, y)` (x east, y north,
 * recovered from `extended()` UV so the finite difference stays smooth across
 * the page edge) wrt `(θ, φ)`, with the θ column divided by cos φ — the metric
 * factor that makes a conformal map a scaled rotation.
 *
 * Fourth-order central differences, stepping `h` in ARC LENGTH on both axes
 * (`Δθ = h / cos φ`): the second keeps round-off independent of how close the
 * point is to a pole, the first keeps the truncation error (∝ (h/γ)⁴, γ = the
 * distance to the nearest feature of the map) negligible near the azimuthal
 * projections' back pole, where a second-order stencil is off by 4e-6.
 */
export function jacobian(
  proj: Projection,
  fit: FitParams,
  theta: number,
  phi: number,
  h = 1e-5,
): { j11: number; j12: number; j21: number; j22: number } {
  const p1 = new Float64Array(2);
  const p2 = new Float64Array(2);
  const m1 = new Float64Array(2);
  const m2 = new Float64Array(2);
  const plane = (t: number, p: number, out: Float64Array): void => {
    proj.extended(t, p, fit, out);
    out[0] = (out[0]! - 0.5) * 2 * fit.halfW;
    out[1] = (0.5 - out[1]!) * 2 * fit.halfH;
  };
  const c = Math.cos(phi);
  const dt = h / c;
  // d/ds f ≈ (−f(+2h) + 8 f(+h) − 8 f(−h) + f(−2h)) / 12h
  plane(theta + dt, phi, p1);
  plane(theta + 2 * dt, phi, p2);
  plane(theta - dt, phi, m1);
  plane(theta - 2 * dt, phi, m2);
  const j11 = (-p2[0]! + 8 * p1[0]! - 8 * m1[0]! + m2[0]!) / (12 * h);
  const j21 = (-p2[1]! + 8 * p1[1]! - 8 * m1[1]! + m2[1]!) / (12 * h);
  plane(theta, phi + h, p1);
  plane(theta, phi + 2 * h, p2);
  plane(theta, phi - h, m1);
  plane(theta, phi - 2 * h, m2);
  const j12 = (-p2[0]! + 8 * p1[0]! - 8 * m1[0]! + m2[0]!) / (12 * h);
  const j22 = (-p2[1]! + 8 * p1[1]! - 8 * m1[1]! + m2[1]!) / (12 * h);
  // j11/j21 are already d/d(arc length) = (d/dθ)/cos φ — the scaled column.
  return { j11, j12, j21, j22 };
}

/** Wrap-aware `(θ)` helper for tests that compare chart coordinates directly. */
export const wrapped = wrapTheta;

/**
 * Fraction of the sphere's AREA the page covers, measured by sampling
 * `forward()` on a `cols × rows` midpoint grid weighted by cos φ.
 */
export function coveredFraction(proj: Projection, fit: FitParams, cols = 720, rows = 360): number {
  const uv = new Float64Array(2);
  let covered = 0;
  let total = 0;
  forEachCell(cols, rows, (theta, phi, cosPhi) => {
    total += cosPhi;
    if (proj.forward(theta, phi, fit, uv)) covered += cosPhi;
  });
  return covered / total;
}

/**
 * Area of the sphere under the stereographic rectangle `|X| ≤ w`, `|Y| ≤ h`,
 * as a fraction of 4π. The sphere's area element in the plane is
 * `16/(4 + ρ²)² dX dY`; the inner Y-integral has the closed form
 * `y/(2c²(c²+y²)) + atan(y/c)/(2c³)` (`c² = 4 + x²`), and the outer one is
 * composite Simpson — an integration independent of the sphere sampling.
 */
export function stereographicAnalyticFraction(halfW: number, halfH: number): number {
  const inner = (x: number): number => {
    const c2 = 4 + x * x;
    const c = Math.sqrt(c2);
    return halfH / (2 * c2 * (c2 + halfH * halfH)) + Math.atan(halfH / c) / (2 * c * c2);
  };
  const n = 4000; // even
  const step = halfW / n;
  let sum = inner(0) + inner(halfW);
  for (let i = 1; i < n; i++) sum += inner(i * step) * (i % 2 === 1 ? 4 : 2);
  const quarter = (sum * step) / 3;
  // 4 quadrants, area element 16/(…)², over the sphere's 4π.
  return (4 * 16 * quarter) / (4 * Math.PI);
}
