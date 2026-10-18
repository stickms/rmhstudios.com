/**
 * End-map calibration, the AFTER page's mirror correction and its alignment
 * with the spin (spec §4.5, §4.6, §7.4). OWNER: T13. Pure, client-safe.
 *
 * ## The correctness core of the effect
 *
 * `F(·, 1) = R·p` with `R` orthogonal and `det R = −1` (for the shipped
 * construction `R = −I`, the antipodal map — spec §4.6): the eversion ends with
 * the sphere turned inside out, so what the visitor sees from outside is the
 * BACK side (the AFTER page). But a side viewed from outside after an
 * orientation-reversing map reads MIRRORED, so the AFTER page cannot be sampled
 * through the plain projection. It is sampled through `P(M_after · p)`.
 *
 * ## The derivation (so nobody has to rediscover it)
 *
 * Body space is x right, y DOWN, z toward the viewer (`domain.ts`). Let `p` be a
 * point of the round sphere (the surface PARAMETER — what the vertex shader's
 * `(θ, φ)` attribute names, whatever the eversion has since done to it). At the
 * end of the eversion that point is on screen at
 *
 *     X(s) = Ry(s) · R · p       (tilt is level — 0 — by the time the spin lands)
 *
 * where `s` is the spin channel and `Ry` is the same rotation as `viewOf` in
 * `lib/globe.ts`. What the visitor should read at that pixel is the page's own
 * picture of the direction they are looking along, i.e. the page vector
 * `q = M·p` should equal `X` once the spin has landed (`s = θ_align`):
 *
 *     M · p = Ry(θ_align) · R · p    for all p     ⇒    M_after = Ry(θ_align) · R.
 *
 * `det M_after = det R = −1`: the reflection built into the eversion is undone
 * by a reflection in the lookup, which is the whole mirror correction. `p → q`
 * then agrees with `p → X` on screen, so the page reads right-handed and page-up
 * is screen-up for every projection that has those on the front hemisphere (all
 * five do). Before the landing the page is merely rotated rigidly by the
 * remaining spin (`q = Ry(θ_align − s)·X`) — never mirrored.
 *
 * The spec writes `M_after = R⁻¹ ∘ Rot_align`. That is the same matrix with
 * `Rot_align = R·Ry(θ_align)·R` (a proper rotation: the spin conjugated by the
 * reflection); for `R = −I`, which commutes with everything, it is plainly
 * `−Ry(θ_align)`. This module builds the factored form directly, because it is
 * the one a reader can check against the picture above.
 *
 * ## `θ_align` — what it is and why it is not arbitrary
 *
 * Any `θ_align` yields a correct, unmirrored M by the formula above; the angle
 * only chooses WHICH surface point carries the page's centre. We choose the
 * ANTIPODE of the BEFORE page's centre, `c = (0, 0, −1)`, because that is the
 * point the eversion carries to the front: `R·c = +z` for `R = −I`, so the spin
 * lands at `θ_align = 0` — the globe finishes where it began and the after page
 * unfurls from the orientation the before page wrapped in. For a generic `R` the
 * spin (a rotation about `axis`) can only fix the azimuth of `R·c`; its
 * component along the axis cannot be spun away, and is left as is.
 *
 * ## For T23 (fragment shader) — the back-face lookup, exactly
 *
 * - **Which vector:** the unit sphere point of the fragment's SURFACE PARAMETER,
 *   `p = spherePoint(θ, φ) = (cos φ·sin θ, −sin φ, cos φ·cos θ)` — NOT the
 *   evert-displaced position and NOT the spun/camera-space position. It is a
 *   pure function of the `(θ, φ)` attribute: interpolate `p` (or recompute it
 *   per fragment), but never interpolate the `(θ', φ')` of the result across the
 *   page seam.
 * - **Lookup:** `q = u_afterM * p` (GLSL `mat3 * vec3`), then
 *   `θ' = atan(q.x, q.z)`, `φ' = asin(−q.y)`, and index the same projection LUT
 *   / projection function the BEFORE side uses with `(θ', φ')` (`lutTexel`).
 * - **Upload:** {@link afterDomainTransform} returns a COLUMN-MAJOR
 *   `Float64Array(9)`: `gl.uniformMatrix3fv(loc, false, new Float32Array(m))`
 *   (transpose = false) and `u_afterM * p` is exactly this module's `M·p`.
 * - **The `u` flip is folded in.** Do NOT flip `u` (or `v`) in the shader: the
 *   mirror correction is the reflection inside `M_after` (`det = −1`). A second
 *   flip would re-mirror the page.
 * - **Front faces** (BEFORE) use `P(p)` with no matrix.
 *
 * ## For T31 (orchestrator)
 *
 * `θ_align = alignAngle(R)` goes into `TimelineConfig.thetaAlign`, and the SAME
 * value into `afterDomainTransform(R, SPIN_AXIS, θ_align)` for the renderer's
 * `u_afterM`. The spin lands on `θ_align + 2πk`; `M` is 2π-periodic so `k` does
 * not matter. Neither is per-frame work: `R` is memoised and `M` is constant for
 * a run.
 *
 * Tests: spec §11.1 tests 12–14 (outward normals flip; no mirror, page-up is
 * screen-up; alignment within 0.1°).
 */

import { SPIN_AXIS, TAU, spherePoint } from './domain';
import { evert } from './thurston';
import type { EndIsometry, EvertFn, Mat3, Vec3 } from './types';

/** The fit grid: 24 longitudes × 13 latitudes (poles included) — 312 points, 15° apart. */
const FIT_THETA = 24;
const FIT_PHI = 13;
/** Spec §4.5: the end map must be an isometry to this tolerance. */
const MAX_RESIDUAL = 1e-4;
const MAX_DET_ERROR = 1e-6;

let memo: EndIsometry | null = null;

/** Determinant of a row-major 3×3 held in a plain array. */
function det9(m: readonly number[]): number {
  return (
    m[0]! * (m[4]! * m[8]! - m[5]! * m[7]!) -
    m[1]! * (m[3]! * m[8]! - m[5]! * m[6]!) +
    m[2]! * (m[3]! * m[7]! - m[4]! * m[6]!)
  );
}

/**
 * The orthogonal polar factor of a row-major 3×3 by Newton's iteration
 * `A ← (A + A⁻ᵀ)/2`. Unlike an SVD route it needs no decomposition code, it
 * PRESERVES the sign of `det` (so a reflection stays a reflection — exactly what
 * Kabsch "allowing a reflection" means), and for a near-orthogonal start (ours
 * is) it converges in a handful of steps.
 */
function polarFactor(m: number[]): number[] {
  let a = m.slice();
  for (let iter = 0; iter < 100; iter++) {
    const d = det9(a);
    if (Math.abs(d) < 1e-300) throw new Error('eversion: end-map fit is degenerate');
    // A⁻ᵀ = cofactor(A) / det
    const c = [
      a[4]! * a[8]! - a[5]! * a[7]!,
      a[5]! * a[6]! - a[3]! * a[8]!,
      a[3]! * a[7]! - a[4]! * a[6]!,
      a[2]! * a[7]! - a[1]! * a[8]!,
      a[0]! * a[8]! - a[2]! * a[6]!,
      a[1]! * a[6]! - a[0]! * a[7]!,
      a[1]! * a[5]! - a[2]! * a[4]!,
      a[2]! * a[3]! - a[0]! * a[5]!,
      a[0]! * a[4]! - a[1]! * a[3]!,
    ];
    let change = 0;
    a = a.map((x, i) => {
      const y = 0.5 * (x + c[i]! / d);
      change = Math.max(change, Math.abs(y - x));
      return y;
    });
    if (change < 1e-15) break;
  }
  return a;
}

/**
 * Fit the end isometry `R` to the oracle at `e = 1` (Kabsch with reflection):
 * the orthogonal `R` minimising `Σ‖F(p, 1) − R·p‖²` over a 24 × 13 grid, which
 * is the polar factor of `Σ F·pᵀ`. Asserts `residual ≤ 1e-4` and `det ≈ −1`
 * (spec §4.5) — a failure is a bug in the oracle, thrown rather than rendered
 * as a subtly wrong page.
 *
 * Memoised for the default oracle (the fit is pure and the oracle is fixed);
 * passing `evaluate` — the tests do, to inject a mock — is never cached.
 */
export function fitEndIsometry(evaluate?: EvertFn): EndIsometry {
  if (!evaluate && memo) return memo;
  const F = evaluate ?? evert;
  const p = new Float64Array(3);
  const f = new Float64Array(3);
  const pts: number[] = [];
  const M = [0, 0, 0, 0, 0, 0, 0, 0, 0];
  for (let i = 0; i < FIT_THETA; i++) {
    const theta = -Math.PI + (i * TAU) / FIT_THETA;
    for (let j = 0; j < FIT_PHI; j++) {
      const phi = -Math.PI / 2 + (j * Math.PI) / (FIT_PHI - 1);
      spherePoint(theta, phi, p);
      F(theta, phi, 1, f, 0);
      for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) M[r * 3 + c]! += f[r]! * p[c]!;
      pts.push(theta, phi);
    }
  }
  const rm = polarFactor(M);
  // Row-major → the column-major `Mat3` of the contract.
  const R: Mat3 = new Float64Array(9);
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) R[c * 3 + r] = rm[r * 3 + c]!;

  let residual = 0;
  for (let k = 0; k < pts.length; k += 2) {
    const theta = pts[k]!;
    const phi = pts[k + 1]!;
    spherePoint(theta, phi, p);
    F(theta, phi, 1, f, 0);
    const v = apply(R, p[0]!, p[1]!, p[2]!);
    residual = Math.max(residual, Math.hypot(f[0]! - v[0], f[1]! - v[1], f[2]! - v[2]));
  }
  const det = det9(rm);
  if (!(residual <= MAX_RESIDUAL)) {
    throw new Error(`eversion: end map is not an isometry (residual ${residual})`);
  }
  if (!(Math.abs(det + 1) <= MAX_DET_ERROR)) {
    throw new Error(`eversion: end map is not a reflection (det ${det})`);
  }
  const result: EndIsometry = { R, det, residual };
  if (!evaluate) memo = result;
  return result;
}

/** `R·v` for a column-major `R`. */
function apply(R: Mat3, x: number, y: number, z: number): [number, number, number] {
  return [
    R[0]! * x + R[3]! * y + R[6]! * z,
    R[1]! * x + R[4]! * y + R[7]! * z,
    R[2]! * x + R[5]! * y + R[8]! * z,
  ];
}

function unitAxis(axis: Vec3): [number, number, number] {
  const n = Math.hypot(axis[0], axis[1], axis[2]);
  return [axis[0] / n, axis[1] / n, axis[2] / n];
}

/**
 * The spin angle (radians, modulo 2π, in `[0, 2π)`) about `axis` after which the
 * AFTER page's centre faces the camera, given the end isometry `R`. `axis`
 * defaults to `SPIN_AXIS`.
 *
 * The page centre sits at the antipode `c = (0, 0, −1)` of the BEFORE page's
 * centre (see the module docblock); its end position is `R·c`, and `θ_align` is
 * the rotation about `axis` that carries the component of `R·c` perpendicular to
 * the axis onto that of `+z`, the direction to the camera. For `R = −I` that is
 * exactly 0. If `R·c` lies along the axis there is no azimuth to fix; 0.
 */
export function alignAngle(R: Mat3, axis: Vec3 = SPIN_AXIS): number {
  const a = unitAxis(axis);
  const v = apply(R, 0, 0, -1);
  const vPar = v[0] * a[0] + v[1] * a[1] + v[2] * a[2];
  // t = +z, so its parallel part is a_z and its perpendicular part is z − a_z·a.
  const vp = [v[0] - vPar * a[0], v[1] - vPar * a[1], v[2] - vPar * a[2]];
  const tp = [-a[2] * a[0], -a[2] * a[1], 1 - a[2] * a[2]];
  const dot = vp[0]! * tp[0]! + vp[1]! * tp[1]! + vp[2]! * tp[2]!;
  const cx = vp[1]! * tp[2]! - vp[2]! * tp[1]!;
  const cy = vp[2]! * tp[0]! - vp[0]! * tp[2]!;
  const cz = vp[0]! * tp[1]! - vp[1]! * tp[0]!;
  const sin = a[0] * cx + a[1] * cy + a[2] * cz;
  if (Math.hypot(sin, dot) < 1e-9) return 0;
  const theta = Math.atan2(sin, dot);
  // Float dust around 0 (R = −I leaves ~1e-17) must not wrap to 2π − ε.
  if (Math.abs(theta) < 1e-12) return 0;
  return theta < 0 ? theta + TAU : theta;
}

/**
 * `M_after = Rot(axis, θ_align) · R` (spec §4.5's `R⁻¹ ∘ Rot_align`, factored as
 * derived in the module docblock): the 3×3, **column-major**, that the AFTER
 * side's domain lookups apply to the surface-parameter point `p` before the
 * projection, `P(M_after · p)`. `det = −1`. `thetaAlign` is {@link alignAngle}'s
 * result; the plan lists `afterDomainTransform(R, spinAxis)`, but the angle is
 * the other input, so it is an explicit parameter here. Writes into `out` if given.
 */
export function afterDomainTransform(R: Mat3, axis: Vec3, thetaAlign: number, out?: Mat3): Mat3 {
  const [x, y, z] = unitAxis(axis);
  const c = Math.cos(thetaAlign);
  const s = Math.sin(thetaAlign);
  const k = 1 - c;
  // Rodrigues' rotation, row-major.
  const rot = [
    c + x * x * k,
    x * y * k - z * s,
    x * z * k + y * s,
    y * x * k + z * s,
    c + y * y * k,
    y * z * k - x * s,
    z * x * k - y * s,
    z * y * k + x * s,
    c + z * z * k,
  ];
  // M = rot · R with R column-major (R[col * 3 + row]); written column-major.
  const tmp = new Float64Array(9);
  for (let col = 0; col < 3; col++) {
    for (let row = 0; row < 3; row++) {
      tmp[col * 3 + row] =
        rot[row * 3]! * R[col * 3]! +
        rot[row * 3 + 1]! * R[col * 3 + 1]! +
        rot[row * 3 + 2]! * R[col * 3 + 2]!;
    }
  }
  const m = out ?? new Float64Array(9);
  m.set(tmp);
  return m;
}
