/**
 * Shared helpers for the eversion unit tests (tasks T02; spec §11.1).
 *
 * Every math task (projections, LUT, oracle, orientation, mesh) needs the same
 * five things: a grid of sample points on the sphere, numerical Jacobians to
 * check analytic derivatives against, a deterministic random source, a
 * best-fit rigid map to use as an oracle, and a comparison that does not turn a
 * million-sample loop into a million `expect()` calls. They live here so the
 * tests agree on conventions — above all the T01 chart (`domain.ts`):
 * `θ ∈ [−π, π]` with `θ = 0` facing the viewer, `φ ∈ [−π/2, π/2]` with `+π/2`
 * north, body y DOWN.
 *
 * Not a test file (no `.test.` in the name), so vitest does not collect it; it
 * has its own tests in `helpers.test.ts`. Importable from node, no DOM.
 * `ssimGray` is deliberately absent: it belongs to T14, which runs in Node
 * against PNGs.
 */

import { expect } from 'vitest';
import { PHI_MAX, PHI_MIN, THETA_MIN, TAU } from '../domain';

export type Vec2 = readonly [number, number];
export type Vec3 = readonly [number, number, number];
/** Row-major 3×3. */
export type Mat3 = readonly [
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
];

/** A chart sample `(θ, φ)` in radians. */
export interface GridPoint {
  readonly theta: number;
  readonly phi: number;
}

/* ── Sphere sampling ─────────────────────────────────────────────────────── */

export interface SphereGridOptions {
  /**
   * Keep the samples off the poles, where the chart is singular. With `false`
   * (the default) latitudes include `±π/2` exactly, so a test can probe the
   * pole itself; with `true` they are the centres of `nφ` equal latitude bands.
   */
  excludePoles?: boolean;
}

/**
 * `nθ × nφ` sample points in the T01 chart, longitude-major (`φ` varies
 * fastest).
 *
 * Longitudes are `nθ` equal steps from `−π` WITHOUT repeating `+π` — the seam
 * is one meridian, and sampling it twice would double-weight it in every
 * average a test takes. Latitudes run `−π/2 … +π/2` inclusive (or band
 * centres with {@link SphereGridOptions.excludePoles}); `nφ = 1` yields the
 * equator.
 */
export function sphereGrid(
  nTheta: number,
  nPhi: number,
  { excludePoles = false }: SphereGridOptions = {},
): GridPoint[] {
  const out: GridPoint[] = [];
  for (let i = 0; i < nTheta; i++) {
    const theta = THETA_MIN + (i * TAU) / nTheta;
    for (let j = 0; j < nPhi; j++) {
      let phi: number;
      if (excludePoles) phi = PHI_MIN + ((j + 0.5) * (PHI_MAX - PHI_MIN)) / nPhi;
      else phi = nPhi === 1 ? 0 : PHI_MIN + (j * (PHI_MAX - PHI_MIN)) / (nPhi - 1);
      out.push({ theta, phi });
    }
  }
  return out;
}

/* ── Numerical Jacobians ─────────────────────────────────────────────────── */

/** The partial derivatives of a vector function: the columns of its Jacobian. */
export interface Jacobian<V> {
  /** `∂f/∂θ` */
  readonly dTheta: V;
  /** `∂f/∂φ` */
  readonly dPhi: V;
}

/**
 * Jacobian of `f: (θ, φ) → ℝ²` by central differences with step `h`. The error
 * is O(h²) — exact for linear maps up to rounding — so use `h ≈ 1e-5` for
 * smooth functions and a larger one only where the map has less regularity.
 */
export function jacobian2(
  f: (theta: number, phi: number) => Vec2,
  theta: number,
  phi: number,
  h: number,
): Jacobian<[number, number]> {
  const tp = f(theta + h, phi);
  const tm = f(theta - h, phi);
  const pp = f(theta, phi + h);
  const pm = f(theta, phi - h);
  const k = 1 / (2 * h);
  return {
    dTheta: [(tp[0] - tm[0]) * k, (tp[1] - tm[1]) * k],
    dPhi: [(pp[0] - pm[0]) * k, (pp[1] - pm[1]) * k],
  };
}

/** As {@link jacobian2} for `F: (θ, φ) → ℝ³` — the surface tangents `∂θF`, `∂φF`. */
export function jacobian3(
  F: (theta: number, phi: number) => Vec3,
  theta: number,
  phi: number,
  h: number,
): Jacobian<[number, number, number]> {
  const tp = F(theta + h, phi);
  const tm = F(theta - h, phi);
  const pp = F(theta, phi + h);
  const pm = F(theta, phi - h);
  const k = 1 / (2 * h);
  return {
    dTheta: [(tp[0] - tm[0]) * k, (tp[1] - tm[1]) * k, (tp[2] - tm[2]) * k],
    dPhi: [(pp[0] - pm[0]) * k, (pp[1] - pm[1]) * k, (pp[2] - pm[2]) * k],
  };
}

/** `a × b`. */
export function cross3(a: Vec3, b: Vec3): [number, number, number] {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

/** `a · b`. */
export function dot3(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

/* ── Deterministic randomness ────────────────────────────────────────────── */

/**
 * mulberry32: a 32-bit seeded generator returning `[0, 1)`. Tests that need
 * "random" inputs use it so a failure reproduces from the seed alone.
 */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ── Kabsch ──────────────────────────────────────────────────────────────── */

export interface KabschOptions {
  /**
   * Allow the best orthogonal map to be a reflection (`det = −1`). The default
   * restricts to proper rotations, which is what the classic algorithm returns;
   * T13's mirror-corrected AFTER page is exactly the case that needs `true`.
   */
  allowReflection?: boolean;
}

/**
 * The orthogonal matrix `R` (row-major) minimising `Σ‖R·pᵢ − qᵢ‖²` — the Kabsch
 * / orthogonal-Procrustes solution. Used by T13 and as a test oracle for it.
 *
 * Both point sets are taken about the ORIGIN, not their centroids: every user
 * fits maps of the unit sphere, which fix the origin, and re-centring would
 * silently hide a translation bug. Needs ≥ 2 non-collinear pairs for a unique
 * answer; degenerate inputs still return *an* orthogonal minimiser.
 *
 * Method: `H = Σ pᵢ qᵢᵀ = U Σ Vᵀ` (one-sided Jacobi SVD, accurate to ~1e-15 at
 * this size), `R = V·diag(1, 1, d)·Uᵀ` with `d = sign(det(V Uᵀ))` unless
 * reflections are allowed.
 */
export function kabsch(
  P: readonly Vec3[],
  Q: readonly Vec3[],
  { allowReflection = false }: KabschOptions = {},
): Mat3 {
  if (P.length !== Q.length || P.length === 0) {
    throw new RangeError('kabsch: P and Q must be non-empty and the same length');
  }
  // H[a][b] = Σ p_a q_b, stored as columns for the column-orthogonalising SVD.
  const H = [0, 0, 0, 0, 0, 0, 0, 0, 0];
  for (let n = 0; n < P.length; n++) {
    for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) H[a * 3 + b]! += P[n]![a]! * Q[n]![b]!;
  }
  const { U, V } = svd3(H);
  const det = det3(mul3(V, transpose3(U)));
  // Flip the direction of least singular weight only when a proper rotation is required.
  const D = [1, 1, !allowReflection && det < 0 ? -1 : 1];
  const VD = V.map((x, idx) => x * D[idx % 3]!);
  return mul3(VD, transpose3(U)) as unknown as Mat3;
}

/** Apply a row-major 3×3 to a vector. */
export function applyMat3(m: Mat3, v: Vec3): [number, number, number] {
  return [
    m[0] * v[0] + m[1] * v[1] + m[2] * v[2],
    m[3] * v[0] + m[4] * v[1] + m[5] * v[2],
    m[6] * v[0] + m[7] * v[1] + m[8] * v[2],
  ];
}

/** Determinant of a row-major 3×3. */
export function det3(m: readonly number[]): number {
  return (
    m[0]! * (m[4]! * m[8]! - m[5]! * m[7]!) -
    m[1]! * (m[3]! * m[8]! - m[5]! * m[6]!) +
    m[2]! * (m[3]! * m[7]! - m[4]! * m[6]!)
  );
}

function transpose3(m: readonly number[]): number[] {
  return [m[0]!, m[3]!, m[6]!, m[1]!, m[4]!, m[7]!, m[2]!, m[5]!, m[8]!];
}

function mul3(a: readonly number[], b: readonly number[]): number[] {
  const out: number[] = new Array(9).fill(0);
  for (let i = 0; i < 3; i++)
    for (let j = 0; j < 3; j++)
      for (let k = 0; k < 3; k++) out[i * 3 + j]! += a[i * 3 + k]! * b[k * 3 + j]!;
  return out;
}

/**
 * Hestenes one-sided Jacobi SVD of a row-major 3×3: `A = U·diag(σ)·Vᵀ`, with
 * `U`, `V` orthogonal (row-major). Singular values are not returned — Kabsch
 * only needs the frames. A rank-deficient `A` gets its missing `U` columns
 * completed to a right-handed orthonormal frame.
 */
function svd3(A: readonly number[]): { U: number[]; V: number[] } {
  const a = [col(A, 0), col(A, 1), col(A, 2)];
  const v: number[][] = [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ];
  const dotc = (x: number[], y: number[]) => x[0]! * y[0]! + x[1]! * y[1]! + x[2]! * y[2]!;
  for (let sweep = 0; sweep < 60; sweep++) {
    let rotated = false;
    for (let p = 0; p < 2; p++) {
      for (let q = p + 1; q < 3; q++) {
        const alpha = dotc(a[p]!, a[p]!);
        const beta = dotc(a[q]!, a[q]!);
        const gamma = dotc(a[p]!, a[q]!);
        if (gamma === 0 || Math.abs(gamma) <= 1e-17 * Math.sqrt(alpha * beta)) continue;
        rotated = true;
        const zeta = (beta - alpha) / (2 * gamma);
        const t = Math.sign(zeta || 1) / (Math.abs(zeta) + Math.sqrt(1 + zeta * zeta));
        const c = 1 / Math.sqrt(1 + t * t);
        const s = c * t;
        for (const m of [a, v]) {
          const mp = m[p]!;
          const mq = m[q]!;
          for (let r = 0; r < 3; r++) {
            const x = mp[r]!;
            const y = mq[r]!;
            mp[r] = c * x - s * y;
            mq[r] = s * x + c * y;
          }
        }
      }
    }
    if (!rotated) break;
  }
  // Order by singular value (descending) so the weakest direction is last.
  const sigma = a.map((c) => Math.sqrt(dotc(c, c)));
  const order = [0, 1, 2].sort((i, j) => sigma[j]! - sigma[i]!);
  const u: number[][] = order.map((i) =>
    a[i]!.map((x) => (sigma[i]! > 1e-300 ? x / sigma[i]! : 0)),
  );
  const vv = order.map((i) => v[i]!);
  const tiny = sigma[order[0]!]! * 1e-14;
  if (sigma[order[1]!]! <= tiny) {
    // Rank ≤ 1: any orthonormal completion of u[0] will do.
    const u0 = u[0]!;
    const seed: Vec3 = Math.abs(u0[0]!) < 0.9 ? [1, 0, 0] : [0, 1, 0];
    const n1 = cross3(u0 as unknown as Vec3, seed);
    const l = Math.hypot(n1[0], n1[1], n1[2]);
    u[1] = n1.map((x) => x / l);
  }
  if (sigma[order[2]!]! <= tiny) {
    u[2] = cross3(u[0] as unknown as Vec3, u[1] as unknown as Vec3);
  }
  // Columns → row-major matrices: M[r][c] = column_c[r].
  const toRows = (cols: number[][]) => [
    cols[0]![0]!,
    cols[1]![0]!,
    cols[2]![0]!,
    cols[0]![1]!,
    cols[1]![1]!,
    cols[2]![1]!,
    cols[0]![2]!,
    cols[1]![2]!,
    cols[2]![2]!,
  ];
  return { U: toRows(u), V: toRows(vv) };
}

function col(m: readonly number[], c: number): number[] {
  return [m[c]!, m[3 + c]!, m[6 + c]!];
}

/* ── Assertions ──────────────────────────────────────────────────────────── */

/**
 * Assert `a ≈ b` within absolute tolerance `tol`, ONCE.
 *
 * `a` and `b` are numbers or equal-length arrays/typed arrays. The comparison
 * runs over all elements and remembers the FIRST counter-example (index, both
 * values, difference), then makes a single `expect()` — so a test can call it
 * on a million-element buffer, or once per sample inside a loop, without
 * paying `expect()` per element, and the failure message still says where it
 * went wrong. A `NaN` on either side is always a counter-example.
 */
export function expectClose(
  a: number | ArrayLike<number>,
  b: number | ArrayLike<number>,
  tol: number,
  label = 'values',
): void {
  const av = typeof a === 'number' ? [a] : a;
  const bv = typeof b === 'number' ? [b] : b;
  let failure: string | null = null;
  if (av.length !== bv.length) {
    failure = `${label}: length ${av.length} !== ${bv.length}`;
  } else {
    for (let i = 0; i < av.length; i++) {
      const x = av[i]!;
      const y = bv[i]!;
      if (!(Math.abs(x - y) <= tol)) {
        failure = `${label}: first counter-example at [${i}]: ${x} vs ${y} (|Δ| = ${Math.abs(x - y)} > ${tol})`;
        break;
      }
    }
  }
  expect(failure, failure ?? label).toBeNull();
}
