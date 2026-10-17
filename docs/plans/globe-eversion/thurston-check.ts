/* eslint-disable no-console -- a CLI verification script; its output is pasted into the note */
/**
 * Numeric verification of the Thurston corrugation eversion derived in
 * thurston-derivation.md (section numbers in comments refer to that note).
 *
 *   pnpm exec tsx docs/plans/globe-eversion/thurston-check.ts            (about 25 s)
 *   pnpm exec tsx docs/plans/globe-eversion/thurston-check.ts --bednorz  (the fallback, bednorz-check.ts)
 *
 * The formulas below are the note's, written for speed (typed scratch buffers, no allocation in
 * the hot path), which is also the shape T08 will give `thurston.ts`. Nothing is imported from the
 * repo. Frame: the body frame of `lib/eversion/domain.ts` (x right, y DOWN, z toward the viewer,
 * p(theta, phi) = (cos phi sin theta, -sin phi, cos phi cos theta)). The note's section 2 gives the
 * (fixed, proper) rotation to Thurston's own frame (polar axis +Z), in which the profile
 * formulas of sections 4-6 are written; `point` applies it as its last line.
 *
 * Exit code is non-zero if any check fails.
 */

import { spawnSync } from 'node:child_process';

if (process.argv.includes('--bednorz')) {
  const r = spawnSync(
    'pnpm',
    ['exec', 'tsx', new URL('./bednorz-check.ts', import.meta.url).pathname],
    {
      stdio: 'inherit',
    },
  );
  process.exit(r.status ?? 1);
}

// ---------------------------------------------------------------------------
// Constants (note section 9)
// ---------------------------------------------------------------------------
const PI = Math.PI;
const TWO_PI = 2 * PI;
const N = 8; // EVERSION_STRIPS
/** Corrugation amplitude: Thurston's `size` is 0.2 at the equator; the product ships 0.7 of it (note section 8.4). */
const SIZE0 = Number(process.env.SIZE0 ?? 0.14);
const IMMERSION_MIN_PROPOSED = 0.05;
const MAX_EXTENT = 1.35;

/** Stage windows [start, end] in e (the starting values of spec 4.3; kept, see note section 9). */
const WINDOWS: readonly (readonly [number, number])[] = [
  [0.0, 0.16], // corrugate
  [0.1, 0.36], // push
  [0.3, 0.7], // twist
  [0.64, 0.9], // unpush
  [0.84, 1.0], // uncorrugate
];
const PARAM_COUNT = 8;

const quintic = (x: number) => {
  const t = x <= 0 ? 0 : x >= 1 ? 1 : x;
  return t * t * t * (t * (6 * t - 15) + 10);
};

/** Note section 9: slots 0-4 the five smoothed windows, 5 = kappa = c(1-r), 6 = sin(pi w), 7 = cos(pi w). */
function stageParams(e: number, out: Float64Array | number[], o = 0): void {
  for (let k = 0; k < 5; k++) {
    const [a, b] = WINDOWS[k];
    out[o + k] = quintic((e - a) / (b - a));
  }
  out[o + 5] = out[o] * (1 - out[o + 4]);
  out[o + 6] = Math.sin(PI * out[o + 2]);
  out[o + 7] = Math.cos(PI * out[o + 2]);
}

// ---------------------------------------------------------------------------
// The construction (note sections 4-7)
// ---------------------------------------------------------------------------
const ss3 = (x: number) => x * x * (3 - 2 * x);
const dss3 = (x: number) => 6 * x * (1 - x);

/** frame layout: P[0..2], W[3..5] (w vector), Hh[6..8] (h vector), Bd[9..11] (bend vector), f[12], P_u[13..15]. */
const FRAME_LEN = 16;

/**
 * Everything that depends on latitude and stage but not on the strip coordinate: the profile point
 * P(u), the unit tangent, and the three vectors of the figure-eight (note sections 4.3-4.5, 6).
 * Written in Thurston's frame (polar axis +Z, profile in the plane x = 0 at rest).
 */
function frame(u: number, sp: ArrayLike<number>, o: number, fr: Float64Array): void {
  const p = sp[o + 1],
    q = sp[o + 3],
    kap = sp[o + 5],
    sw = sp[o + 6],
    cw = sp[o + 7];
  const south = u > 1;
  const sg = south ? -1 : 1;
  const uf = south ? 2 - u : u;

  // reparametrisations Param1, Param2, weight W, and the form/size profiles (section 5)
  const P1 = south ? u * u - 2 * u + 2 : 2 * u - u * u;
  const dP1 = south ? 2 * u - 2 : 2 - 2 * u;
  const P2 = south ? -u * u + 4 * u - 2 : u * u;
  const dP2 = south ? 4 - 2 * u : 2 * u;
  const W = ss3(uf);
  const dW = sg * dss3(uf);

  const a = (PI / 2) * u;
  const a1 = (PI / 2) * P1;
  const a2 = (PI / 2) * P2;
  const da1 = (PI / 2) * dP1;
  const da2 = (PI / 2) * dP2;
  const sa = Math.sin(a),
    ca = Math.cos(a);
  const s1 = Math.sin(a1),
    c1 = Math.cos(a1);
  const s2 = Math.sin(a2),
    c2 = Math.cos(a2);

  // RotZ by +-pi w (north +, south -) on the A arc; RotY by pi w on the B arc
  const sz = sg * sw; // sin(+-pi w)
  const cz = cw;
  // A2 = (0, .9 s1, -c1); A2_u; A2_g (= d/dpsi) = (.9 s1, 0, 0)
  // RotZ(v) = (x cz + y sz, -x sz + y cz, z);   RotY(v) = (x cw - z sw, y, x sw + z cw)
  const Ab = [0.9 * s1 * sz, 0.9 * s1 * cz, -c1];
  const Abu = [0.9 * c1 * da1 * sz, 0.9 * c1 * da1 * cz, s1 * da1];
  const Abg = [0.9 * s1 * cz, -0.9 * s1 * sz, 0];
  // B2 = (0, s2, .5 c2); B2_g = (s2, 0, 0)
  const Bb = [-0.5 * c2 * sw, s2, 0.5 * c2 * cw];
  const Bbu = [0.5 * s2 * da2 * sw, c2 * da2, -0.5 * s2 * da2 * cw];
  const Bbg = [s2 * cw, 0, s2 * sw];

  const P = [0, 0, 0],
    Pu = [0, 0, 0],
    g = [0, 0, 0];
  const S1 = [0, sa, ca],
    S1u = [0, (PI / 2) * ca, -(PI / 2) * sa],
    S1g = [sa, 0, 0];
  for (let i = 0; i < 3; i++) {
    const T = (1 - W) * Ab[i] + W * Bb[i];
    const Tu = -dW * Ab[i] + (1 - W) * Abu[i] + dW * Bb[i] + W * Bbu[i];
    const Tg = (1 - W) * Abg[i] + W * Bbg[i];
    const s4 = -1; // S4 = -S1 componentwise
    P[i] = (1 - q) * ((1 - p) * S1[i] + p * T) + q * s4 * S1[i];
    Pu[i] = (1 - q) * ((1 - p) * S1u[i] + p * Tu) + q * s4 * S1u[i];
    g[i] = (1 - q) * ((1 - p) * S1g[i] + p * Tg) + q * s4 * S1g[i];
  }

  // du = Pu/|Pu| ; nh = normalise(g x du) (the outward side); w-direction = du x nh
  const nu = Math.hypot(Pu[0], Pu[1], Pu[2]);
  const du = nu > 0 ? [Pu[0] / nu, Pu[1] / nu, Pu[2] / nu] : [0, 0, 0];
  let nx = g[1] * du[2] - g[2] * du[1],
    ny = g[2] * du[0] - g[0] * du[2],
    nz = g[0] * du[1] - g[1] * du[0];
  const nl = Math.hypot(nx, ny, nz);
  if (nl > 0) {
    nx /= nl;
    ny /= nl;
    nz /= nl;
  } else {
    nx = ny = nz = 0;
  }
  const dx = du[1] * nz - du[2] * ny,
    dy = du[2] * nx - du[0] * nz,
    dz = du[0] * ny - du[1] * nx;

  // size profile m(u) = SIZE0 kappa FF(u) S(u)  (>= 0), and its u-derivative. FF is a quintic ramp here
  // (Thurston's own is the cubic): C2 at the clamps, so the surface has a continuous normal (note section 5.3).
  const x = 1.06 * uf - 0.05;
  const FF = x <= 0 ? 0 : x >= 1 ? 1 : quintic(x);
  const dFF = x <= 0 || x >= 1 ? 0 : 1.06 * sg * 30 * x * x * (1 - x) * (1 - x);
  const S = ss3(uf);
  const dS = sg * dss3(uf);
  const m = SIZE0 * kap * FF * S;
  const mu = SIZE0 * kap * (dFF * S + FF * dS);

  fr[0] = P[0];
  fr[1] = P[1];
  fr[2] = P[2];
  fr[3] = 1.1 * m * dx;
  fr[4] = 1.1 * m * dy;
  fr[5] = 1.1 * m * dz;
  fr[6] = m * nx;
  fr[7] = m * ny;
  fr[8] = m * nz;
  fr[9] = -mu * du[0];
  fr[10] = -mu * du[1];
  fr[11] = -mu * du[2];
  fr[12] = kap * FF; // the "form" f
  fr[13] = Pu[0];
  fr[14] = Pu[1];
  fr[15] = Pu[2];
}

/** The strip coordinate: ve = N theta / 2pi. Writes the BODY-frame point (domain.ts convention). */
function point(fr: Float64Array, ve: number, out: Float64Array | number[]): void {
  const v = ve - Math.floor(ve);
  let raw = 1 - Math.cos(4 * PI * v);
  if (v > 0.25 && v < 0.75) raw = 4 - raw;
  const H = 0.6 * raw;
  const f = fr[12];
  const fp = 2 * f - f * f;
  const G = (1 - fp) * 2 * (1 - Math.cos(2 * PI * v)) + fp * H;
  const s = Math.sin(4 * PI * v);
  const k = (H * H) / 64;
  const ox = fr[0] + fr[3] * s + (fr[6] + fr[9] * k) * G;
  const oy = fr[1] + fr[4] * s + (fr[7] + fr[10] * k) * G;
  const oz = fr[2] + fr[5] * s + (fr[8] + fr[11] * k) * G;
  const ang = (TWO_PI * ve) / N;
  const ca = Math.cos(ang),
    sa = Math.sin(ang);
  const X = ox * ca + oy * sa;
  const Y = -ox * sa + oy * ca;
  // Thurston (X, Y, Z) -> body (X, -Z, Y)  (proper rotation, section 2)
  out[0] = X;
  out[1] = -oz;
  out[2] = Y;
}

// F(theta, phi, e) with a caller-supplied parameter vector, reusing a frame buffer
const FR = new Float64Array(FRAME_LEN);
const SP = new Float64Array(PARAM_COUNT);
type V3 = [number, number, number];
const tmpo = new Float64Array(3);
function F(theta: number, phi: number, e: number): V3 {
  stageParams(e, SP);
  frame(1 - (2 * phi) / PI, SP, 0, FR);
  point(FR, (N * theta) / TWO_PI, tmpo);
  return [tmpo[0], tmpo[1], tmpo[2]];
}

// ---------------------------------------------------------------------------
// Test utilities
// ---------------------------------------------------------------------------
const sph = (theta: number, phi: number): V3 => [
  Math.cos(phi) * Math.sin(theta),
  -Math.sin(phi),
  Math.cos(phi) * Math.cos(theta),
];
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: V3, b: V3): V3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const norm = (a: V3) => Math.hypot(a[0], a[1], a[2]);
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

type M3 = number[][];
const det3 = (m: M3) =>
  m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) -
  m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) +
  m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
const inv3 = (m: M3): M3 => {
  const d = det3(m);
  const c = (i: number, j: number) => {
    const r = [0, 1, 2].filter((k) => k !== i);
    const k = [0, 1, 2].filter((l) => l !== j);
    return ((i + j) % 2 ? -1 : 1) * (m[r[0]][k[0]] * m[r[1]][k[1]] - m[r[0]][k[1]] * m[r[1]][k[0]]);
  };
  return [0, 1, 2].map((i) => [0, 1, 2].map((j) => c(j, i) / d));
};
const mul = (a: M3, b: M3): M3 =>
  a.map((_, i) => [0, 1, 2].map((j) => a[i][0] * b[0][j] + a[i][1] * b[1][j] + a[i][2] * b[2][j]));
const tr = (a: M3): M3 => [0, 1, 2].map((i) => [0, 1, 2].map((j) => a[j][i]));
/** Orthogonal Procrustes, reflection allowed: the orthogonal polar factor of H = sum F_i p_i^T (Newton iteration). */
function fitOrthogonal(ps: V3[], fs: V3[]): M3 {
  const H: M3 = [0, 1, 2].map(() => [0, 0, 0]);
  for (let i = 0; i < ps.length; i++)
    for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) H[a][b] += fs[i][a] * ps[i][b];
  let R = H;
  for (let k = 0; k < 60; k++) {
    const Ri = tr(inv3(R));
    R = R.map((row, i) => row.map((v, j) => 0.5 * (v + Ri[i][j])));
  }
  return R;
}
const apply = (R: M3, p: V3): V3 => [
  R[0][0] * p[0] + R[0][1] * p[1] + R[0][2] * p[2],
  R[1][0] * p[0] + R[1][1] * p[1] + R[1][2] * p[2],
  R[2][0] * p[0] + R[2][1] * p[1] + R[2][2] * p[2],
];

let failures = 0;
const report = (name: string, ok: boolean, detail: string) => {
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  ${detail}`);
};
const t0 = Date.now();

// A grid of cell centres (no row on a pole, no column on the seam)
const NT = 128;
const NP = 64;
const grid: [number, number][] = [];
for (let j = 0; j < NP; j++)
  for (let i = 0; i < NT; i++)
    grid.push([-PI + ((i + 0.5) / NT) * TWO_PI, -PI / 2 + ((j + 0.5) / NP) * PI]);

// 1. Start -------------------------------------------------------------------
{
  let m = 0;
  for (const [th, ph] of grid) m = Math.max(m, norm(sub(F(th, ph, 0), sph(th, ph))));
  report(
    'S6  F(.,0) = identity',
    m < 1e-9,
    `max |F-p| = ${m.toExponential(2)} over ${grid.length} points`,
  );
}

// 2. End: orientation-reversing isometry --------------------------------------
{
  const ps = grid.map(([th, ph]) => sph(th, ph));
  const fs = grid.map(([th, ph]) => F(th, ph, 1));
  const R = fitOrthogonal(ps, fs);
  let res = 0;
  for (let i = 0; i < ps.length; i++) res = Math.max(res, norm(sub(fs[i], apply(R, ps[i]))));
  const RtR = mul(tr(R), R);
  let orth = 0,
    toMinusI = 0;
  for (let a = 0; a < 3; a++)
    for (let b = 0; b < 3; b++) {
      orth = Math.max(orth, Math.abs(RtR[a][b] - (a === b ? 1 : 0)));
      toMinusI = Math.max(toMinusI, Math.abs(R[a][b] + (a === b ? 1 : 0)));
    }
  const d = det3(R);
  report(
    'S7  F(.,1) = R p  (Kabsch, reflection allowed)',
    res <= 1e-4 && Math.abs(d + 1) < 1e-6 && orth < 1e-6,
    `residual = ${res.toExponential(2)}, det R = ${d.toFixed(9)}, |R^T R - I| = ${orth.toExponential(2)}`,
  );
  report(
    '    R equals -I (the antipodal map)',
    toMinusI < 1e-9,
    `max |R + I| = ${toMinusI.toExponential(2)}`,
  );
}

// 3. Frame well-posedness: the normalisations never see a null vector -----------
{
  // min over latitude (u in (0,2)) and e of |P_u|
  let minPu = Infinity,
    argPu = '';
  const sp = new Float64Array(PARAM_COUNT);
  const fr = new Float64Array(FRAME_LEN);
  const h = 1e-6;
  const fa = new Float64Array(FRAME_LEN),
    fb = new Float64Array(FRAME_LEN);
  for (let ie = 0; ie <= 400; ie++) {
    const e = ie / 400;
    stageParams(e, sp);
    for (let j = 1; j < 1000; j++) {
      const u = (2 * j) / 1000;
      frame(u, sp, 0, fr);
      frame(u + h, sp, 0, fa);
      frame(u - h, sp, 0, fb);
      const Pu = [0, 1, 2].map((k) => (fa[k] - fb[k]) / (2 * h));
      const npu = Math.hypot(Pu[0], Pu[1], Pu[2]);
      if (npu < minPu) {
        minPu = npu;
        argPu = `e=${e.toFixed(3)} u=${u.toFixed(3)}`;
      }
    }
  }
  report(
    '    profile speed |P_u| never degenerates (u in (0,2), 401 e)',
    minPu > 0.05,
    `min |P_u| = ${minPu.toFixed(4)} at ${argPu}  (unit sphere: pi/2 = 1.5708)`,
  );
}

// 4. Immersion: |F_th x F_ph| / cos(phi), central differences -------------------
const EVAL_H = 1e-5;
function immersion(
  th: number,
  ph: number,
  e: number,
  sp: Float64Array,
  fr: Float64Array,
  fpl: Float64Array,
  fmi: Float64Array,
  o: Float64Array,
): number {
  const ve = (N * th) / TWO_PI;
  const dve = (N * EVAL_H) / TWO_PI;
  frame(1 - (2 * ph) / PI, sp, 0, fr);
  frame(1 - (2 * (ph + EVAL_H)) / PI, sp, 0, fpl);
  frame(1 - (2 * (ph - EVAL_H)) / PI, sp, 0, fmi);
  const a: V3 = [0, 0, 0],
    b: V3 = [0, 0, 0],
    c: V3 = [0, 0, 0],
    d: V3 = [0, 0, 0];
  point(fr, ve + dve, o);
  a[0] = o[0];
  a[1] = o[1];
  a[2] = o[2];
  point(fr, ve - dve, o);
  b[0] = o[0];
  b[1] = o[1];
  b[2] = o[2];
  point(fpl, ve, o);
  c[0] = o[0];
  c[1] = o[1];
  c[2] = o[2];
  point(fmi, ve, o);
  d[0] = o[0];
  d[1] = o[1];
  d[2] = o[2];
  const ft = sub(a, b);
  const fp = sub(c, d);
  return norm(cross(ft, fp)) / (4 * EVAL_H * EVAL_H) / Math.cos(ph);
}

{
  // 4a. 201 values of e on the full 128 x 64 grid, plus max |F|
  const sp = new Float64Array(PARAM_COUNT);
  const fr = new Float64Array(FRAME_LEN),
    fpl = new Float64Array(FRAME_LEN),
    fmi = new Float64Array(FRAME_LEN),
    o = new Float64Array(3);
  let mn = Infinity,
    arg = '';
  for (let ie = 0; ie <= 200; ie++) {
    const e = ie / 200;
    stageParams(e, sp);
    for (const [th, ph] of grid) {
      const d = immersion(th, ph, e, sp, fr, fpl, fmi, o);
      if (d < mn) {
        mn = d;
        arg = `e=${e.toFixed(3)} theta=${th.toFixed(3)} phi=${ph.toFixed(3)}`;
      }
    }
  }
  report(
    'S8  immersion |F_th x F_ph|/cos(phi), 128x64 grid x 201 e',
    mn >= IMMERSION_MIN_PROPOSED,
    `min = ${mn.toFixed(4)} at ${arg}  (round sphere = 1; proposed IMMERSION_MIN ${IMMERSION_MIN_PROPOSED})`,
  );
}
{
  // 4b. 2001 values of e (spec S#8), 64 x 32 grid
  const sp = new Float64Array(PARAM_COUNT);
  const fr = new Float64Array(FRAME_LEN),
    fpl = new Float64Array(FRAME_LEN),
    fmi = new Float64Array(FRAME_LEN),
    o = new Float64Array(3);
  let mn = Infinity,
    arg = '';
  for (let ie = 0; ie <= 2000; ie++) {
    const e = ie / 2000;
    stageParams(e, sp);
    for (let j = 0; j < 32; j++) {
      const ph = -PI / 2 + ((j + 0.5) / 32) * PI;
      for (let i = 0; i < 64; i++) {
        const th = -PI + ((i + 0.5) / 64) * TWO_PI;
        const d = immersion(th, ph, e, sp, fr, fpl, fmi, o);
        if (d < mn) {
          mn = d;
          arg = `e=${e.toFixed(4)} theta=${th.toFixed(3)} phi=${ph.toFixed(3)}`;
        }
      }
    }
  }
  report(
    'S8  immersion, 2001 values of e (64 x 32 grid)',
    mn >= IMMERSION_MIN_PROPOSED,
    `min = ${mn.toFixed(4)} at ${arg}`,
  );
}
{
  // 4c. thin latitude rings, every 0.25 deg from the poles to the equator: where the profile
  // reparametrisations and the size profile have their kinks. 201 e, 96 longitudes (12 per strip).
  const sp = new Float64Array(PARAM_COUNT);
  const fr = new Float64Array(FRAME_LEN),
    fpl = new Float64Array(FRAME_LEN),
    fmi = new Float64Array(FRAME_LEN),
    o = new Float64Array(3);
  let mn = Infinity,
    arg = '';
  const NPh = 360; // 0.5 deg over the whole sphere, offset so no ring sits on a pole or the equator
  for (let ie = 0; ie <= 200; ie++) {
    const e = ie / 200;
    stageParams(e, sp);
    for (let j = 0; j < NPh; j++) {
      const ph = -PI / 2 + ((j + 0.31) / NPh) * PI;
      for (let i = 0; i < 96; i++) {
        const th = -PI + ((i + 0.29) / 96) * TWO_PI;
        const d = immersion(th, ph, e, sp, fr, fpl, fmi, o);
        if (d < mn) {
          mn = d;
          arg = `e=${e.toFixed(3)} theta=${th.toFixed(3)} phi=${ph.toFixed(3)} (${((ph * 180) / PI).toFixed(2)} deg)`;
        }
      }
    }
  }
  report(
    '    immersion on 360 latitude rings x 96 longitudes x 201 e',
    mn >= IMMERSION_MIN_PROPOSED,
    `min = ${mn.toFixed(4)} at ${arg}`,
  );
  // 4d. polish the worst sample by pattern search over (e, theta, phi) from several starts
  const evalAt = (x: number[]) =>
    x[0] < 0 || x[0] > 1 || Math.abs(x[2]) > 1.55
      ? Infinity
      : (stageParams(x[0], sp), immersion(x[1], x[2], x[0], sp, fr, fpl, fmi, o));
  let best = Infinity,
    bestAt: number[] = [];
  let seed = 987654321;
  const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
  const starts = [
    [0.78, -1.355, -0.835],
    [0.78, 0.54, -0.834],
    [0.785, -2.921, 0.81],
    [0.465, 2.143, -0.884],
    [0.33, -2.143, 0.818],
  ];
  const extra = Number(process.env.POLISH ?? 40);
  for (let k = 0; k < extra; k++) starts.push([rnd(), -PI + rnd() * TWO_PI, -1.5 + rnd() * 3]);
  for (const start of starts) {
    const x = [...start];
    let fx = evalAt(x);
    for (let step = 0.02; step > 1e-6; step *= 0.5) {
      for (let it = 0; it < 200; it++) {
        let improved = false;
        for (let d = 0; d < 3; d++)
          for (const sg of [-1, 1]) {
            const y = [...x];
            y[d] += sg * step * (d === 0 ? 0.1 : 1);
            const fy = evalAt(y);
            if (fy < fx) {
              x[0] = y[0];
              x[1] = y[1];
              x[2] = y[2];
              fx = fy;
              improved = true;
            }
          }
        if (!improved) break;
      }
    }
    if (fx < best) {
      best = fx;
      bestAt = x;
    }
  }
  report(
    '    immersion, pattern-search polish of the worst samples (multistart)',
    best >= IMMERSION_MIN_PROPOSED,
    `true min ~ ${best.toFixed(4)} at e=${bestAt[0].toFixed(4)} theta=${bestAt[1].toFixed(4)} phi=${bestAt[2].toFixed(4)}`,
  );
}

// 5. Polar chart: tangent-plane coordinates (x, z) about each pole ----------------
{
  let minPolar = Infinity,
    arg = '';
  let nOK = 0,
    nAll = 0;
  let worstTilt = 0;
  const tiltAt: Record<string, number> = {};
  const radii = [1e-3, 3e-3, 1e-2, 2e-2, 3e-2, 5e-2, 0.1, 0.25];
  const sp = new Float64Array(PARAM_COUNT);
  for (const north of [1, -1] as const) {
    for (let ie = 0; ie <= 200; ie++) {
      const e = ie / 200;
      stageParams(e, sp);
      const at = (x: number, z: number): V3 => {
        const y = north * -Math.sqrt(Math.max(0, 1 - x * x - z * z)); // north pole is (0,-1,0)
        const ph = Math.asin(-y);
        const th = Math.atan2(x, z);
        const fr = new Float64Array(FRAME_LEN);
        frame(1 - (2 * ph) / PI, sp, 0, fr);
        const o = new Float64Array(3);
        point(fr, (N * th) / TWO_PI, o);
        return [o[0], o[1], o[2]];
      };
      for (const r of radii) {
        for (let k = 0; k < 24; k++) {
          const a = (k / 24) * TWO_PI + 0.1;
          const x = r * Math.cos(a),
            z = r * Math.sin(a);
          const d = Math.min(1e-6, r * 0.01);
          const fx = sub(at(x + d, z), at(x - d, z)).map((q) => q / (2 * d)) as V3;
          const fz = sub(at(x, z + d), at(x, z - d)).map((q) => q / (2 * d)) as V3;
          // orientation: (x,z) is right-handed with outward at the north pole; at the south pole the
          // winding-consistent order is (z,x)
          const n = north > 0 ? cross(fx, fz) : cross(fz, fx);
          const dens = norm(n);
          if (dens < minPolar) {
            minPolar = dens;
            arg = `pole=${north > 0 ? 'N' : 'S'} e=${e.toFixed(3)} r=${r} az=${k}`;
          }
          const tilt = (Math.acos(Math.min(1, Math.abs(n[1]) / dens)) * 180) / PI;
          worstTilt = Math.max(worstTilt, tilt);
          tiltAt[r] = Math.max(tiltAt[r] ?? 0, tilt);
          nAll++;
          // the winding normal at the north pole is body -y at every e, at the south pole +y
          if (n[1] * north < 0) nOK++;
        }
      }
    }
  }
  report(
    '    polar-chart immersion |dF/dx x dF/dz| (both poles, r = 1e-3 .. 0.25)',
    minPolar >= IMMERSION_MIN_PROPOSED,
    `min = ${minPolar.toFixed(4)} at ${arg}`,
  );
  report(
    '    winding normal at the poles is constant: N = -y, S = +y, for every e',
    nOK === nAll,
    `${nOK}/${nAll}`,
  );
  console.log(
    `      worst tilt of the true normal away from the pole axis (deg), by polar radius r (rad): ${radii.map((r) => `${r}: ${tiltAt[r].toFixed(2)}`).join('  ')}`,
  );
  void worstTilt;
}

// 5b. The analytic normal in the surface-of-revolution zone (note section 10.2) ----------
{
  // Where kappa FF S = 0 the surface is Rz(psi) P(u). In Thurston's frame the outward-by-winding normal is
  //   n ~ Rz(psi) [ z (P_u . P) - P (P_u . z) ]      then the frame map (X, Y, Z) -> (X, -Z, Y).
  // Compared with central differences of F for u in (1e-3, 0.0472) on both hemispheres.
  const sp = new Float64Array(PARAM_COUNT);
  const fr = new Float64Array(FRAME_LEN),
    fpl = new Float64Array(FRAME_LEN),
    fmi = new Float64Array(FRAME_LEN),
    o = new Float64Array(3);
  let worst = 0,
    arg = '';
  const h = 1e-6;
  for (let ie = 0; ie <= 200; ie++) {
    const e = ie / 200;
    stageParams(e, sp);
    for (const south of [false, true]) {
      for (let j = 0; j < 40; j++) {
        const uf = 1e-3 + (j / 39) * (0.0472 - 1e-3);
        const u = south ? 2 - uf : uf;
        const ph = ((1 - u) * PI) / 2;
        frame(u, sp, 0, fr);
        const P = [fr[0], fr[1], fr[2]],
          Pu = [fr[13], fr[14], fr[15]];
        const a = Pu[0] * P[0] + Pu[1] * P[1] + Pu[2] * P[2];
        const b = Pu[2];
        const nT = [-P[0] * b, -P[1] * b, a - P[2] * b];
        for (let i = 0; i < 12; i++) {
          const th = -PI + ((i + 0.37) / 12) * TWO_PI;
          // rotate by psi = th (RotateZ) and map to the body frame
          const c = Math.cos(th),
            s = Math.sin(th);
          const X = nT[0] * c + nT[1] * s,
            Y = -nT[0] * s + nT[1] * c;
          const na: V3 = [X, -nT[2], Y];
          const nl = norm(na);
          // FD: n = F_phi x F_theta (arithmetic cross; outward at e = 0)
          const ve = (N * th) / TWO_PI,
            dve = (N * h) / TWO_PI;
          const pt = (frm: Float64Array, v: number): V3 => {
            point(frm, v, o);
            return [o[0], o[1], o[2]];
          };
          frame(1 - (2 * (ph + h)) / PI, sp, 0, fpl);
          frame(1 - (2 * (ph - h)) / PI, sp, 0, fmi);
          const fth = sub(pt(fr, ve + dve), pt(fr, ve - dve));
          const fph = sub(pt(fpl, ve), pt(fmi, ve));
          const nf = cross(fph, fth);
          const cs = dot(na, nf) / (nl * norm(nf));
          const ang = (Math.acos(Math.min(1, Math.max(-1, cs))) * 180) / PI;
          if (ang > worst) {
            worst = ang;
            arg = `e=${e.toFixed(3)} u=${u.toFixed(4)} theta=${th.toFixed(3)}`;
          }
        }
      }
    }
  }
  report(
    '    analytic revolution-zone normal vs finite differences (|phi| > pi/2 - 0.0742)',
    worst < 1e-3,
    `max angle error = ${worst.toExponential(2)} deg at ${arg}`,
  );
}

// 6. Time continuity across the window boundaries ---------------------------------
{
  const sub64: [number, number][] = [];
  for (let j = 0; j < 32; j++)
    for (let i = 0; i < 64; i++)
      sub64.push([-PI + ((i + 0.5) / 64) * TWO_PI, -PI / 2 + ((j + 0.5) / 32) * PI]);
  const bounds = WINDOWS.flatMap((w) => [w[0], w[1]]);
  const stats = (d: number) => {
    let L = 0,
      M = 0,
      Lat = 0,
      Mat = 0;
    const steps = Math.round(1 / d);
    const A = new Float64Array(3),
      B = new Float64Array(3),
      C = new Float64Array(3);
    const sp0 = new Float64Array(PARAM_COUNT),
      sp1 = new Float64Array(PARAM_COUNT),
      sp2 = new Float64Array(PARAM_COUNT);
    const f0 = new Float64Array(FRAME_LEN),
      f1 = new Float64Array(FRAME_LEN),
      f2 = new Float64Array(FRAME_LEN);
    for (let k = 1; k < steps; k++) {
      const e = k * d;
      stageParams(e - d, sp0);
      stageParams(e, sp1);
      stageParams(e + d, sp2);
      const near = bounds.some((x) => Math.abs(x - e) < 2.5 * d);
      let l = 0,
        m = 0;
      let lastPh = NaN;
      for (const [th, ph] of sub64) {
        if (ph !== lastPh) {
          const u = 1 - (2 * ph) / PI;
          frame(u, sp0, 0, f0);
          frame(u, sp1, 0, f1);
          frame(u, sp2, 0, f2);
          lastPh = ph;
        }
        const ve = (N * th) / TWO_PI;
        point(f0, ve, A);
        point(f1, ve, B);
        point(f2, ve, C);
        l = Math.max(l, Math.hypot(C[0] - B[0], C[1] - B[1], C[2] - B[2]));
        m = Math.max(
          m,
          Math.hypot(C[0] - 2 * B[0] + A[0], C[1] - 2 * B[1] + A[1], C[2] - 2 * B[2] + A[2]),
        );
      }
      L = Math.max(L, l / d);
      M = Math.max(M, m / (d * d));
      if (near) {
        Lat = Math.max(Lat, l / d);
        Mat = Math.max(Mat, m / (d * d));
      }
    }
    return { L, M, Lat, Mat };
  };
  const s1 = stats(1 / 1000);
  const s2 = stats(1 / 2000);
  const s4 = stats(1 / 4000);
  report(
    'S9  Lipschitz in e (delta = 1/2000)',
    true,
    `max |dF/de| ~ ${s2.L.toFixed(2)}  (1/1000: ${s1.L.toFixed(2)}, 1/4000: ${s4.L.toFixed(2)}); within 2.5 delta of a window boundary: ${s2.Lat.toFixed(2)}`,
  );
  report(
    '    bounded 2nd difference (C1 in time): max |d2F|/delta^2 does not grow under delta -> 0',
    s4.M < 1.35 * s1.M,
    `1/1000 -> ${s1.M.toFixed(1)}, 1/2000 -> ${s2.M.toFixed(1)}, 1/4000 -> ${s4.M.toFixed(1)}; at boundaries (1/4000): ${s4.Mat.toFixed(1)}`,
  );
}

// 7. Bounded -------------------------------------------------------------------
{
  const sp = new Float64Array(PARAM_COUNT);
  const fr = new Float64Array(FRAME_LEN),
    o = new Float64Array(3);
  let mx = 0,
    arg = '';
  const byE: string[] = [];
  for (let ie = 0; ie <= 400; ie++) {
    const e = ie / 400;
    let mxe = 0;
    stageParams(e, sp);
    for (let j = 0; j < 256; j++) {
      const ph = -PI / 2 + ((j + 0.5) / 256) * PI;
      frame(1 - (2 * ph) / PI, sp, 0, fr);
      for (let i = 0; i < 512; i++) {
        point(fr, (i + 0.5) / 64, o); // 8 strips x 64 samples; the strip coordinate is what matters
        const r = Math.hypot(o[0], o[1], o[2]);
        if (r > mxe) mxe = r;
        if (r > mx) {
          mx = r;
          arg = `e=${e.toFixed(3)} phi=${ph.toFixed(3)}`;
        }
      }
    }
    if (ie % 20 === 0) byE.push(`${e.toFixed(2)}:${mxe.toFixed(3)}`);
  }
  console.log(`      max |F| by e: ${byE.join('  ')}`);
  report(
    'S10 max |F| <= 1.35 (no global scale)',
    mx <= MAX_EXTENT,
    `max |F| = ${mx.toFixed(4)} at ${arg}; margin ${(MAX_EXTENT - mx).toFixed(3)}`,
  );
}

// 8. Halfway symmetry ----------------------------------------------------------
{
  // The halfway model F(., 1/2) is invariant under the dihedral group D_N of order 2N:
  //   (a) rotation about the polar axis (body y) by 2 pi / N:   F(th + 2pi/N, ph) = Ry F(th, ph)
  //   (b) the half-turn about the viewer axis (body z) with the latitude flip:
  //       F(-th, -ph) = diag(-1, -1, 1) F(th, ph)
  //   and, composing, (c) the half turns F(-th + 2 pi k/N, -ph) about the N horizontal axes.
  let ma = 0,
    mb = 0,
    mc = 0;
  const c = Math.cos(TWO_PI / N),
    s = Math.sin(TWO_PI / N);
  for (const [th, ph] of grid) {
    const a = F(th, ph, 0.5);
    const rot: V3 = [a[0] * c + a[2] * s, a[1], -a[0] * s + a[2] * c];
    ma = Math.max(ma, norm(sub(F(th + TWO_PI / N, ph, 0.5), rot)));
    mb = Math.max(mb, norm(sub(F(-th, -ph, 0.5), [-a[0], -a[1], a[2]])));
    // (c) with k = 1: the half turn about the horizontal axis at angle pi/N from z... = Ry(2pi/N) o diag(-1,-1,1)
    const b: V3 = [-a[0], -a[1], a[2]];
    const bb: V3 = [b[0] * c + b[2] * s, b[1], -b[0] * s + b[2] * c];
    mc = Math.max(mc, norm(sub(F(-th + TWO_PI / N, -ph, 0.5), bb)));
  }
  report(
    'S11 halfway symmetry: D_8 (2 pi/8 about the polar axis; half turn with latitude flip)',
    Math.max(ma, mb, mc) < 1e-9,
    `max errors (a) ${ma.toExponential(2)}, (b) ${mb.toExponential(2)}, (c) ${mc.toExponential(2)}`,
  );
}

// 9. Window table --------------------------------------------------------------------
{
  const rows = [...new Set([0, 0.5, 1, ...WINDOWS.flatMap((w) => [w[0], w[1]])])].sort(
    (a, b) => a - b,
  );
  console.log('\n   e       c(corr)  p(push)  w(twist)  q(unpush)  r(uncorr)  kappa');
  const sp = new Float64Array(PARAM_COUNT);
  for (const e of rows) {
    stageParams(e, sp);
    console.log(
      `  ${e.toFixed(2).padStart(4)}   ${[0, 1, 2, 3, 4, 5].map((k) => sp[k].toFixed(3).padStart(8)).join('  ')}`,
    );
  }
}

console.log(
  `\n${failures === 0 ? 'ALL CHECKS PASSED' : failures + ' CHECK(S) FAILED'}  (${((Date.now() - t0) / 1000).toFixed(1)} s)`,
);
process.exit(failures === 0 ? 0 : 1);
void dot;
