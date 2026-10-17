/**
 * The Thurston corrugated-sphere eversion — the TypeScript ORACLE (spec §4).
 * OWNER: T08, from the derivation in `docs/plans/globe-eversion/thurston-derivation.md`.
 * Pure, client-safe.
 *
 * ## Why an oracle
 *
 * The eversion has to run in a vertex shader, where it cannot be unit-tested.
 * So it is written FIRST here, in plain TypeScript, and tested exhaustively in
 * node (spec §11.1 tests 6–11 — start, end, immersion, time continuity,
 * boundedness, symmetry). The GLSL in `gl/shaders.ts` is then a port that is
 * checked against this file at 64 values of `e` (test 27), which proves the
 * shader is the eversion the unit tests verified. Nothing in the shader may be
 * "fixed up" without changing this file first.
 *
 * ## Contract
 *
 * `F(θ, φ, e)` maps the sphere point `(θ, φ)` (the chart of `domain.ts`) to a
 * position in body space at eversion progress `e ∈ [0, 1]`:
 *
 * - `F(·, 0)` is the unit sphere (`spherePoint`) to 1e-9;
 * - `F(·, 1) = −p` (the antipodal map, `R = −I`, `det R = −1`);
 * - the surface is an IMMERSION at every `e` (no crease, no pinch);
 * - `max ‖F‖ ≤ MAX_EVERSION_EXTENT` for all `e`.
 *
 * ## The construction
 *
 * Thurston's corrugation eversion (the one behind the film *Outside In*), in
 * the shape of the derivation note: the sphere is swept as a surface of
 * revolution of a PROFILE `Σ(u)` rotated through `θ`; five stages (corrugate,
 * push, twist, unpush, uncorrugate) are one blend of five profiles driven by
 * the smoothed windows of `stageParams`; and the corrugation adds a
 * figure-eight cross-section per strip, a function of the strip coordinate
 * `v = n·θ/2π` and of latitude. The profile and the figure-eight frame depend on
 * latitude and stage only, the point on `v` only — which is why `evert` caches
 * the frame of the last `(φ, e)`: the finite-difference normal and the mesh's
 * rings revisit one latitude many times and pay for the profile once.
 *
 * ## Provenance
 *
 * Thurston's `evert` (Geometry Center) via Michael McGuffin's `sphereEversion`,
 * used with permission. The formulas are re-derived in the note and written here
 * from that note; no source text of either program is copied.
 *
 * ## Frames
 *
 * The note's formulas live in Thurston's frame (polar axis +Z, profile in the
 * plane X = 0 at rest); `point` maps to the body frame `(X, Y, Z) → (X, −Z, Y)`,
 * a proper rotation. The body frame is left-handed (screen-handed), so the
 * outward normal at `e = 0` is `∂φF × ∂θF`, not `∂θF × ∂φF`.
 *
 * All three functions write into caller buffers and never allocate.
 */

import { EVERSION_STRIPS, POLE_EPS, STAGE_PARAM_COUNT, STAGE_WINDOWS } from './constants';
import type { EvertFn, EvertNormalFn, StageParamsFn } from './types';

const PI = Math.PI;
const HALF_PI = PI / 2;
const TWO_PI = 2 * PI;
const N = EVERSION_STRIPS;

/**
 * Corrugation amplitude. Thurston's own is 0.2 at the equator; below ≈ 0.13 the
 * corrugations pinch (note §6), and much above 0.14 the surface leaves the 1.35
 * viewport bound (0.14 gives max‖F‖ = 1.336). Internal on purpose — only the
 * oracle and its shader port need it, and they must agree.
 */
const SIZE0 = 0.14;

/** Central-difference step for the surface normal (the note's value for the oracle). */
const FD_H = 1e-4;

/** Quintic smoothstep `6t⁵ − 15t⁴ + 10t³`, clamped; C² at both ends. */
function quintic(x: number): number {
  const t = x <= 0 ? 0 : x >= 1 ? 1 : x;
  return t * t * t * (t * (6 * t - 15) + 10);
}

/** Cubic smoothstep and its derivative in `uf` (the weight `W` and size envelope `S`). */
const smooth3 = (x: number): number => x * x * (3 - 2 * x);
const dSmooth3 = (x: number): number => 6 * x * (1 - x);

/**
 * The smoothed stage parameters at progress `e` (spec §4.3): the quintic
 * smoothstep of each of `STAGE_WINDOWS` (which overlap by `STAGE_OVERLAP`),
 * written in `EVERT_STAGES` order into slots 0–4 — `c, p, w, q, r` — followed by
 * three derived terms the shader would otherwise recompute per vertex:
 * slot 5 = `κ = c(1 − r)` (the only way the corrugation depends on `e`),
 * slot 6 = `sin πw`, slot 7 = `cos πw`; any further slot is zero. This is what
 * the CPU hands the shader as a uniform array (the GPU does no window math), and
 * what `evert` itself calls — so the two can never disagree about where a stage
 * starts.
 */
export const stageParams: StageParamsFn = (e, out, offset = 0) => {
  for (let k = 0; k < 5; k++) {
    const w = STAGE_WINDOWS[k];
    out[offset + k] = quintic((e - w[0]) / (w[1] - w[0]));
  }
  out[offset + 5] = out[offset] * (1 - out[offset + 4]);
  out[offset + 6] = Math.sin(PI * out[offset + 2]);
  out[offset + 7] = Math.cos(PI * out[offset + 2]);
  for (let k = 8; k < STAGE_PARAM_COUNT; k++) out[offset + k] = 0;
};

/* ── The latitude frame ───────────────────────────────────────────────────── */

/**
 * Layout of a frame: profile point `P` [0..2], the longitude-direction vector
 * `1.1·m·t` [3..5], the normal vector `m·n` [6..8], the bend vector `−m_u·du`
 * [9..11], the form `f = κ·FF` [12], the profile tangent `Σ_u` [13..15].
 */
const FRAME_LEN = 16;

// Module scratch for one frame's profile pieces (note §4): the polar caps A and
// the belt B (point, u-derivative, ψ-derivative), and the unit sphere S₁.
const Ab = new Float64Array(3);
const Abu = new Float64Array(3);
const Abg = new Float64Array(3);
const Bb = new Float64Array(3);
const Bbu = new Float64Array(3);
const Bbg = new Float64Array(3);
const S1p = new Float64Array(3);
const S1u = new Float64Array(3);
const S1g = new Float64Array(3);
// Σ, Σ_u, g of the blended profile.
const Pp = new Float64Array(3);
const Pu = new Float64Array(3);
const Pg = new Float64Array(3);

/**
 * Everything that depends on latitude `u` and the stage parameters but not on the
 * strip coordinate (note §3–§5), in Thurston's frame. `g` and the normalisations
 * vanish at the poles and wherever `m = 0`; the vectors are then zero, and the
 * offset they scale is zero anyway.
 */
function frame(u: number, sp: Float64Array, fr: Float64Array): void {
  const p = sp[1];
  const q = sp[3];
  const kap = sp[5];
  const sw = sp[6];
  const cw = sp[7];
  const south = u > 1;
  const sg = south ? -1 : 1;
  const uf = south ? 2 - u : u;

  // Latitude re-parametrisations (P₁ lingers at the equator, P₂ at the poles),
  // the polar/equatorial blend W, and the size/form profiles.
  const P1 = south ? u * u - 2 * u + 2 : 2 * u - u * u;
  const dP1 = south ? 2 * u - 2 : 2 - 2 * u;
  const P2 = south ? -u * u + 4 * u - 2 : u * u;
  const dP2 = south ? 4 - 2 * u : 2 * u;
  const W = smooth3(uf);
  const dW = sg * dSmooth3(uf);

  const a = HALF_PI * u;
  const da1 = HALF_PI * dP1;
  const da2 = HALF_PI * dP2;
  const sa = Math.sin(a);
  const ca = Math.cos(a);
  const a1 = HALF_PI * P1;
  const a2 = HALF_PI * P2;
  const s1 = Math.sin(a1);
  const c1 = Math.cos(a1);
  const s2 = Math.sin(a2);
  const c2 = Math.cos(a2);

  // A (polar caps, rotated by ±πw about the polar axis) and B (the belt, rotated
  // by πw about the viewer axis): profile, u-derivative, ψ-derivative.
  const sz = sg * sw;
  Ab[0] = 0.9 * s1 * sz;
  Ab[1] = 0.9 * s1 * cw;
  Ab[2] = -c1;
  Abu[0] = 0.9 * c1 * da1 * sz;
  Abu[1] = 0.9 * c1 * da1 * cw;
  Abu[2] = s1 * da1;
  Abg[0] = 0.9 * s1 * cw;
  Abg[1] = -0.9 * s1 * sz;
  Abg[2] = 0;
  Bb[0] = -0.5 * c2 * sw;
  Bb[1] = s2;
  Bb[2] = 0.5 * c2 * cw;
  Bbu[0] = 0.5 * s2 * da2 * sw;
  Bbu[1] = c2 * da2;
  Bbu[2] = -0.5 * s2 * da2 * cw;
  Bbg[0] = s2 * cw;
  Bbg[1] = 0;
  Bbg[2] = s2 * sw;
  S1p[0] = 0;
  S1p[1] = sa;
  S1p[2] = ca;
  S1u[0] = 0;
  S1u[1] = HALF_PI * ca;
  S1u[2] = -HALF_PI * sa;
  S1g[0] = sa;
  S1g[1] = 0;
  S1g[2] = 0;

  // Σ = (1−q)[(1−p)S₁ + p·T(w)] + q·S₄ with S₄ = −S₁; the same blend for Σ_u and g.
  for (let i = 0; i < 3; i++) {
    const T = (1 - W) * Ab[i] + W * Bb[i];
    const Tu = -dW * Ab[i] + (1 - W) * Abu[i] + dW * Bb[i] + W * Bbu[i];
    const Tg = (1 - W) * Abg[i] + W * Bbg[i];
    Pp[i] = (1 - q) * ((1 - p) * S1p[i] + p * T) - q * S1p[i];
    Pu[i] = (1 - q) * ((1 - p) * S1u[i] + p * Tu) - q * S1u[i];
    Pg[i] = (1 - q) * ((1 - p) * S1g[i] + p * Tg) - q * S1g[i];
  }

  // Figure-eight frame: du = Σ_u/‖Σ_u‖, n = g × du (normalised), t = du × n.
  const nu = Math.hypot(Pu[0], Pu[1], Pu[2]);
  const dux = nu > 0 ? Pu[0] / nu : 0;
  const duy = nu > 0 ? Pu[1] / nu : 0;
  const duz = nu > 0 ? Pu[2] / nu : 0;
  let nx = Pg[1] * duz - Pg[2] * duy;
  let ny = Pg[2] * dux - Pg[0] * duz;
  let nz = Pg[0] * duy - Pg[1] * dux;
  const nl = Math.hypot(nx, ny, nz);
  if (nl > 0) {
    nx /= nl;
    ny /= nl;
    nz /= nl;
  } else {
    nx = 0;
    ny = 0;
    nz = 0;
  }
  const tx = duy * nz - duz * ny;
  const ty = duz * nx - dux * nz;
  const tz = dux * ny - duy * nx;

  // m(u) = SIZE0·κ·FF·S ≥ 0 and its u-derivative. FF is a quintic ramp (0 for
  // uf ≤ 0.0472, 1 for uf ≥ 0.9906): the corrugations do not exist within 4.2°
  // of a pole, and the quintic keeps the normal continuous at the clamps.
  const x = 1.06 * uf - 0.05;
  const FF = x <= 0 ? 0 : x >= 1 ? 1 : quintic(x);
  const dFF = x <= 0 || x >= 1 ? 0 : 1.06 * sg * 30 * x * x * (1 - x) * (1 - x);
  const S = smooth3(uf);
  const dS = sg * dSmooth3(uf);
  const m = SIZE0 * kap * FF * S;
  const mu = SIZE0 * kap * (dFF * S + FF * dS);

  fr[0] = Pp[0];
  fr[1] = Pp[1];
  fr[2] = Pp[2];
  fr[3] = 1.1 * m * tx;
  fr[4] = 1.1 * m * ty;
  fr[5] = 1.1 * m * tz;
  fr[6] = m * nx;
  fr[7] = m * ny;
  fr[8] = m * nz;
  fr[9] = -mu * dux;
  fr[10] = -mu * duy;
  fr[11] = -mu * duz;
  fr[12] = kap * FF;
  fr[13] = Pu[0];
  fr[14] = Pu[1];
  fr[15] = Pu[2];
}

/**
 * The body-frame point for strip coordinate `ve = n·θ/2π` and rotation angle
 * `theta` (note §5): the figure-eight offset for `v' = ve − ⌊ve⌋`, then the
 * rotation about the polar axis by `θ` itself (not rebuilt from `v'`), then the
 * frame map. `H` is the form-dependent lobe height (C¹; its second derivative
 * jumps at `v' = ¼, ¾`), `G` blends the true figure-eight (`f' = 0`, near the
 * poles) into two ellipses touching at a point (`f' = 1`, the equator band).
 */
function point(fr: Float64Array, ve: number, theta: number, out: Float64Array, o: number): void {
  const v = ve - Math.floor(ve);
  let raw = 1 - Math.cos(4 * PI * v);
  if (v > 0.25 && v < 0.75) raw = 4 - raw;
  const H = 0.6 * raw;
  const f = fr[12];
  const fp = 2 * f - f * f;
  const G = (1 - fp) * 2 * (1 - Math.cos(TWO_PI * v)) + fp * H;
  const s = Math.sin(4 * PI * v);
  const k = (H * H) / 64;
  const ox = fr[0] + fr[3] * s + (fr[6] + fr[9] * k) * G;
  const oy = fr[1] + fr[4] * s + (fr[7] + fr[10] * k) * G;
  const oz = fr[2] + fr[5] * s + (fr[8] + fr[11] * k) * G;
  const ca = Math.cos(theta);
  const sa = Math.sin(theta);
  out[o] = ox * ca + oy * sa;
  out[o + 1] = -oz;
  out[o + 2] = -ox * sa + oy * ca;
}

/* ── Caches ───────────────────────────────────────────────────────────────── */

const SP = new Float64Array(STAGE_PARAM_COUNT);
const FR = new Float64Array(FRAME_LEN);
const FR_PLUS = new Float64Array(FRAME_LEN);
const FR_MINUS = new Float64Array(FRAME_LEN);
let spE = NaN;
let frE = NaN;
let frPhi = NaN;

/** `stageParams` for `e`, memoised on the last `e` (callers sweep a mesh at one `e`). */
function paramsFor(e: number): Float64Array {
  if (e !== spE) {
    stageParams(e, SP);
    spE = e;
  }
  return SP;
}

/** The frame at latitude `phi`, memoised on the last `(φ, e)`. */
function frameFor(phi: number, e: number): Float64Array {
  if (phi !== frPhi || e !== frE) {
    frame(1 - (2 * phi) / PI, paramsFor(e), FR);
    frPhi = phi;
    frE = e;
  }
  return FR;
}

/**
 * `F(θ, φ, e)` → `out[offset..offset+2]`, body space (spec §4.2). The mesh's
 * polar fans pass `φ = ±π/2` exactly; the poles are fixed points of the
 * corrugation stage and move only under push/unpush (to `(0, ∓Z_N, 0)`).
 */
export const evert: EvertFn = (theta, phi, e, out, offset = 0) => {
  point(frameFor(phi, e), (N * theta) / TWO_PI, theta, out, offset);
};

const TA = new Float64Array(3);
const TB = new Float64Array(3);
const TC = new Float64Array(3);
const TD = new Float64Array(3);

/**
 * The unit normal at `(θ, φ, e)`, oriented by the winding (outward at `e = 0`,
 * inward at `e = 1`; `∂φF × ∂θF` in the left-handed body frame) — finite
 * differences of {@link evert} away from the poles, the exact surface-of-
 * revolution normal within `POLE_EPS` of them (spec §4.4).
 *
 * Why not the spec's constant pole normal: the true normal tilts 2.4° at polar
 * radius 0.01 and 12° at 0.05, so a constant is good to only ≈ 0.003 rad. Within
 * `π/2 − |φ| < 0.0741` the corrugation amplitude is exactly zero and the surface
 * is `Rψ·Σ(u)`, whose normal is closed-form: `ẑ(Σ_u·Σ) − Σ(Σ_u·ẑ)` in the
 * profile frame, rotated by `ψ`, then mapped to body space. `POLE_EPS` is kept
 * below that radius so the zone is exact. At the pole itself the expression is
 * 0/0 and the normal is the constant `(0, ∓1, 0)` (winding normal, every `e`).
 */
export const normal: EvertNormalFn = (theta, phi, e, out, offset = 0) => {
  if (Math.abs(phi) > HALF_PI - POLE_EPS) {
    const fr = frameFor(phi, e);
    const a = fr[13] * fr[0] + fr[14] * fr[1] + fr[15] * fr[2];
    const b = fr[15];
    const nTx = -fr[0] * b;
    const nTy = -fr[1] * b;
    const nTz = a - fr[2] * b;
    const ca = Math.cos(theta);
    const sa = Math.sin(theta);
    const X = nTx * ca + nTy * sa;
    const Y = -nTx * sa + nTy * ca;
    const len = Math.hypot(X, nTz, Y);
    if (len > 1e-9 && Math.abs(phi) < HALF_PI) {
      out[offset] = X / len;
      out[offset + 1] = -nTz / len;
      out[offset + 2] = Y / len;
    } else {
      out[offset] = 0;
      out[offset + 1] = phi > 0 ? -1 : 1;
      out[offset + 2] = 0;
    }
    return;
  }
  // Central differences: ∂θF from two points on this latitude's frame, ∂φF from
  // the frames one step either side.
  const sp = paramsFor(e);
  const ve = (N * theta) / TWO_PI;
  const dve = (N * FD_H) / TWO_PI;
  const fr = frameFor(phi, e);
  point(fr, ve + dve, theta + FD_H, TA, 0);
  point(fr, ve - dve, theta - FD_H, TB, 0);
  frame(1 - (2 * (phi + FD_H)) / PI, sp, FR_PLUS);
  frame(1 - (2 * (phi - FD_H)) / PI, sp, FR_MINUS);
  point(FR_PLUS, ve, theta, TC, 0);
  point(FR_MINUS, ve, theta, TD, 0);
  const tx = TA[0] - TB[0];
  const ty = TA[1] - TB[1];
  const tz = TA[2] - TB[2];
  const px = TC[0] - TD[0];
  const py = TC[1] - TD[1];
  const pz = TC[2] - TD[2];
  // n = ∂φF × ∂θF
  const nx = py * tz - pz * ty;
  const ny = pz * tx - px * tz;
  const nz = px * ty - py * tx;
  const len = Math.hypot(nx, ny, nz) || 1;
  out[offset] = nx / len;
  out[offset + 1] = ny / len;
  out[offset + 2] = nz / len;
};
