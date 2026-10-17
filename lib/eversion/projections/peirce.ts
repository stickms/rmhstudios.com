/**
 * Peirce quincuncial (spec §5.1, §5.3, §5.4) — the page folds around from four
 * corners with no polar gap. OWNER: T06.
 *
 * Conformal, with four singular points. The forward map is the incomplete
 * elliptic integral of the first kind with modulus 1/√2 (Carlson `R_F`); the
 * inverse is Jacobi `cn` of complex argument — see `elliptic.ts` for why those
 * two and how they are evaluated. Both are far too heavy for a fragment shader at
 * 60 fps, which is why EVERY projection is baked to a LUT (spec §5.4) — Peirce
 * is only ever evaluated at bake time, so correctness comes before speed here.
 *
 * ## The layout, derived rather than remembered
 *
 * Stereographic projection of the FRONT hemisphere from the back pole gives the
 * unit disc `|ζ| < 1`, and `w = ∫₀^ζ dt/√(1−t⁴)` maps that disc conformally onto
 * a diamond with vertices `(±a, 0)`, `(0, ±a)`, `a = ϖ/2 ≈ 1.311`. The four
 * vertices are where `ζ⁴ = 1`: the north and south poles and the points at
 * θ = ±π/2 on the equator — Peirce's four singular points. The back hemisphere is
 * the Schwarz reflection of the front across the diamond's edges (the equator of
 * the DISC, i.e. the meridians θ = ±π/2, maps to those edges), which tiles the
 * four corner triangles and completes the axis-aligned square `[−a, a]²`. So:
 *
 * - the page centre `w = 0` is the front point (θ, φ) = (0, 0);
 * - the singular points sit at the square's EDGE MIDPOINTS, away from the centre;
 * - the back pole is all four corners at once.
 *
 * The square's boundary is where the sphere is cut open: four arcs run from the
 * back pole to the four singular points (the back equator and the back meridian
 * θ = ±π), each appearing on two edge halves. The page UV is therefore
 * discontinuous across those arcs and {@link Projection.singular} says so.
 * A bilinear LUT blends the two sides of an arc into a one-texel streak of the
 * page's edge pixels — the same compromise as the mesh seam (`domain.ts`).
 *
 * ## Fit (spec §5.3)
 *
 * The page is CONTAINED in the square, centred, the longer page side ↔ the
 * square's side: `halfW = a` for landscape (`A ≤ 1`), `halfH = a` for portrait.
 * The rest of the square is glass. The covered fraction of the SPHERE comes out
 * as exactly `min(A, 1/A)` — the page rectangle's share of the square's plane
 * area (measured to 1e-4 by integrating the conformal metric
 * `4|1 − ζ⁴| / (1 + |ζ|²)²` and by sampling `forward`; the tests do both).
 *
 * Fit shape: {@link PeirceFit}. Tests: S#1 (excluding 1e-3 rad around the four
 * points), S#2, S#4 — `__tests__/projections-peirce.test.ts`.
 */

import { LUT_UV_EXTENT } from '../constants';
import type { FitParams, PeirceFit, Projection } from '../types';
import { LEMNISCATE_HALF, lemniscateIntegral, zetaOfPlane } from './elliptic';

/** Half the side of the quincuncial square in plane units, `ϖ/2 = ∫₀¹ dt/√(1−t⁴)`. */
export const PEIRCE_SQUARE_HALF = LEMNISCATE_HALF;

/**
 * Angular radius (rad) around the cut arcs that {@link Projection.singular}
 * reports; slightly above the tests' 1e-3 exclusion so the boundary of the
 * excluded set is not itself tested.
 */
const SINGULAR_RADIUS = 1.2e-3;

/**
 * Tolerance (in plane units) for "on the page": the page edge is the square's own
 * edge for the longer side, where rounding would otherwise flip a point that is
 * exactly on it to glass.
 */
const EDGE_EPS = 1e-12;

const scratch = new Float64Array(2);

/**
 * The point `(θ, φ)` in the quincuncial plane (x right, y UP) → `out[0..1]`.
 * Front hemisphere: the lemniscatic integral of its stereographic image.
 * Back hemisphere: the same for the mirror point, reflected across the diamond
 * edge of its quadrant.
 */
function planeOf(theta: number, phi: number, out: Float64Array): void {
  const cp = Math.cos(phi);
  const px = cp * Math.sin(theta);
  const pz = cp * Math.cos(theta);
  const north = Math.sin(phi); // body y points down, so "up" is −p_y = sin φ
  const front = pz >= 0;
  // Stereographic from the pole on the far side of the hemisphere in question.
  const inv = 1 / (front ? 1 + pz : 1 - pz);
  lemniscateIntegral(px * inv, north * inv, out);
  if (!front) {
    const x = out[0]!;
    const y = out[1]!;
    const a = PEIRCE_SQUARE_HALF;
    // Reflect across the edge |x| + |y| = a of this quadrant.
    out[0] = (x < 0 ? -1 : 1) * (a - Math.abs(y));
    out[1] = (y < 0 ? -1 : 1) * (a - Math.abs(x));
  }
}

/** Keep an extended UV finite and inside the LUT's range (`constants.ts` `LUT_UV_EXTENT`). */
function clampExtent(v: number): number {
  return v > LUT_UV_EXTENT ? LUT_UV_EXTENT : v < -LUT_UV_EXTENT ? -LUT_UV_EXTENT : v;
}

function asPeirceFit(fit: FitParams): PeirceFit {
  if (fit.kind !== 'peirce') {
    throw new Error(`peirce: expected a peirce fit, got ${fit.kind}`);
  }
  return fit;
}

export const peirce: Projection = {
  id: 'peirce',

  fit(w: number, h: number): PeirceFit {
    const aspect = h / w;
    const a = PEIRCE_SQUARE_HALF;
    return {
      kind: 'peirce',
      aspect,
      squareHalf: a,
      halfW: aspect <= 1 ? a : a / aspect,
      halfH: aspect <= 1 ? a * aspect : a,
    };
  },

  forward(theta, phi, fit, out, offset = 0) {
    const f = asPeirceFit(fit);
    if (!Number.isFinite(theta) || !Number.isFinite(phi)) return false;
    planeOf(theta, phi, scratch);
    const x = scratch[0]!;
    const y = scratch[1]!;
    if (Math.abs(x) > f.halfW + EDGE_EPS || Math.abs(y) > f.halfH + EDGE_EPS) return false;
    const u = 0.5 + x / (2 * f.halfW);
    const v = 0.5 - y / (2 * f.halfH);
    out[offset] = u < 0 ? 0 : u > 1 ? 1 : u;
    out[offset + 1] = v < 0 ? 0 : v > 1 ? 1 : v;
    return true;
  },

  extended(theta, phi, fit, out, offset = 0) {
    const f = asPeirceFit(fit);
    if (!Number.isFinite(theta) || !Number.isFinite(phi)) {
      // Never poison a LUT: an undefined point sits at the page centre.
      out[offset] = 0.5;
      out[offset + 1] = 0.5;
      return;
    }
    planeOf(theta, phi, scratch);
    out[offset] = clampExtent(0.5 + scratch[0]! / (2 * f.halfW));
    out[offset + 1] = clampExtent(0.5 - scratch[1]! / (2 * f.halfH));
  },

  inverse(u, v, fit, out, offset = 0) {
    const f = asPeirceFit(fit);
    if (!(u >= -EDGE_EPS && u <= 1 + EDGE_EPS && v >= -EDGE_EPS && v <= 1 + EDGE_EPS)) {
      return false;
    }
    let x = (u - 0.5) * 2 * f.halfW;
    let y = (0.5 - v) * 2 * f.halfH;
    const a = PEIRCE_SQUARE_HALF;
    if (Math.abs(x) > a || Math.abs(y) > a) {
      x = Math.max(-a, Math.min(a, x));
      y = Math.max(-a, Math.min(a, y));
    }
    // Outside the diamond is the back hemisphere: undo the reflection, solve on
    // the front, and lift the result to the far side.
    const back = Math.abs(x) + Math.abs(y) > a;
    if (back) {
      const rx = (x < 0 ? -1 : 1) * (a - Math.abs(y));
      const ry = (y < 0 ? -1 : 1) * (a - Math.abs(x));
      x = rx;
      y = ry;
    }
    zetaOfPlane(x, y, scratch);
    const zr = scratch[0]!;
    const zi = scratch[1]!;
    const r2 = zr * zr + zi * zi;
    const k = 1 / (1 + r2);
    const px = 2 * zr * k;
    const north = 2 * zi * k;
    const pzMag = (1 - r2) * k;
    const pz = back ? -pzMag : pzMag;
    out[offset] = Math.atan2(px, pz);
    out[offset + 1] = Math.atan2(north, Math.hypot(px, pz));
    return true;
  },

  singular(theta, phi) {
    const cp = Math.cos(phi);
    const px = cp * Math.sin(theta);
    const pz = cp * Math.cos(theta);
    const north = Math.sin(phi);
    // The cut: back meridian (px ≈ 0, pz ≤ 0) and back equator (north ≈ 0, pz ≤ 0),
    // which between them hold the back pole and all four singular points.
    return (
      pz <= SINGULAR_RADIUS &&
      (Math.abs(px) <= SINGULAR_RADIUS || Math.abs(north) <= SINGULAR_RADIUS)
    );
  },
};
