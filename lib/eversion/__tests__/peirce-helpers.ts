/**
 * Helpers private to `projections-peirce.test.ts` (T06). The shared test helpers
 * (T02) did not exist when this was written; nothing here is meant to be reused.
 */

import { spherePoint } from '../domain';
import { PEIRCE_SQUARE_HALF } from '../projections/peirce';
import { zetaOfPlane } from '../projections/elliptic';
import type { PeirceFit, Projection } from '../types';

/** Straight-line distance between two sphere points given as (θ, φ) — blind to seam and pole wrapping. */
export function chord(t1: number, p1: number, t2: number, p2: number): number {
  const a = new Float64Array(3);
  const b = new Float64Array(3);
  spherePoint(t1, p1, a);
  spherePoint(t2, p2, b);
  return Math.hypot(a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!);
}

/** Plane position (x right, y up) of an extended UV under `fit`. */
export function planeOfUV(u: number, v: number, fit: PeirceFit): [number, number] {
  return [(u - 0.5) * 2 * fit.halfW, (0.5 - v) * 2 * fit.halfH];
}

/** Extended-UV → plane position of `(θ, φ)`. */
export function planeAt(
  p: Projection,
  theta: number,
  phi: number,
  fit: PeirceFit,
): [number, number] {
  const out = new Float64Array(2);
  p.extended(theta, phi, fit, out);
  return planeOfUV(out[0]!, out[1]!, fit);
}

/**
 * Sphere area per unit plane area at plane position `(x, y)`: `4|1 − ζ⁴|/(1+|ζ|²)²`,
 * with `ζ` the stereographic image of the point (the back hemisphere is the mirror
 * of the front across the diamond edge, so its density is the reflected point's).
 * Independent of `forward`; uses only the inverse's `cn` evaluation.
 */
export function sphereDensity(x: number, y: number): number {
  const a = PEIRCE_SQUARE_HALF;
  if (Math.abs(x) + Math.abs(y) > a) {
    const rx = (x < 0 ? -1 : 1) * (a - Math.abs(y));
    const ry = (y < 0 ? -1 : 1) * (a - Math.abs(x));
    x = rx;
    y = ry;
  }
  const z = new Float64Array(2);
  zetaOfPlane(x, y, z);
  const zr = z[0]!;
  const zi = z[1]!;
  const r2 = zr * zr + zi * zi;
  const z2r = zr * zr - zi * zi;
  const z2i = 2 * zr * zi;
  const z4r = z2r * z2r - z2i * z2i;
  const z4i = 2 * z2r * z2i;
  return (4 * Math.hypot(1 - z4r, -z4i)) / ((1 + r2) * (1 + r2));
}

/** Midpoint-rule integral of {@link sphereDensity} over `[x0,x1]×[y0,y1]`, as a fraction of 4π. */
export function analyticCoverage(x0: number, x1: number, y0: number, y1: number, n = 500): number {
  const dx = (x1 - x0) / n;
  const dy = (y1 - y0) / n;
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const x = x0 + (i + 0.5) * dx;
    for (let j = 0; j < n; j++) {
      sum += sphereDensity(x, y0 + (j + 0.5) * dy);
    }
  }
  return (sum * dx * dy) / (4 * Math.PI);
}
