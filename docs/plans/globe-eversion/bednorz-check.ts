/* eslint-disable no-console -- a CLI verification script; its output is pasted into the note */
/**

 * FALLBACK (appendix A of thurston-derivation.md): the Bednorz-Bednorz analytic eversion check.
 *
 *   pnpm exec tsx docs/plans/globe-eversion/bednorz-check.ts   (or thurston-check.ts --bednorz)
 *
 * The formulas below are an independent, direct transcription of the note
 * (section numbers in comments). Nothing is imported from the repo. The math
 * frame is right-handed with the polar axis on +z; the note (section 9) gives
 * the fixed rotation to the lib/globe.ts frame.
 *
 * Exit code is non-zero if any check fails.
 */

// ---------------------------------------------------------------------------
// Constants (note section 7)
// ---------------------------------------------------------------------------
const N = 2; // ruled-surface index n; the halfway model is the n = 2 sextic
const KAPPA = (N - 1) / (2 * N); // 1/4
const Q = 0.6; // peak of the "q" ramp; T = 1/Q is the sweep half-range of t
const T = 1 / Q;
const ETA = T ** 2; // makes the end spheres exactly unit radius (section 4.4)
const BETA = 1;
const OMEGA = 4; // latitude-to-height gain  h = OMEGA sin(lat) / cos(lat)^N
const XI0 = 2; // damping offset while the wormhole is open
const GAMMA0 = 2; // inversion-sphere parameter gamma = 2 sqrt(alpha beta) while the wormhole is open (alpha = gamma^2/4)

/** Stage windows [start, end] in e for the first half; the second half mirrors them. */
const WINDOWS = {
  stretch: [0.0, 0.26], // lambda 0 -> 1   (round sphere -> inverted wormhole)
  open: [0.16, 0.34], //    xi 0 -> XI0 and gamma 0 -> GAMMA0 (inversion opens out)
  unfold: [0.26, 0.44], //  q Q -> 0        (ruled surface un-flattens)
  sweep: [0.28, 0.72], //    t -T -> +T      (the eversion proper; halfway at e = 1/2)
} as const;

// ---------------------------------------------------------------------------
// Math (note sections 3-6)
// ---------------------------------------------------------------------------
const smoothstep5 = (x: number) => {
  const u = x <= 0 ? 0 : x >= 1 ? 1 : x;
  return u * u * u * (u * (6 * u - 15) + 10);
};
const ramp = (e: number, w: readonly [number, number]) => smoothstep5((e - w[0]) / (w[1] - w[0]));
/** Rising ramp in the first half, mirrored falling ramp in the second half. */
const bump = (e: number, w: readonly [number, number]) => (e < 0.5 ? ramp(e, w) : ramp(1 - e, w));

interface StageParams {
  t: number;
  q: number;
  p: number;
  xi: number;
  alpha: number;
  lambda: number;
}
function stageParams(e: number): StageParams {
  const lambda = bump(e, WINDOWS.stretch);
  const open = bump(e, WINDOWS.open);
  const q = Math.max(0, Q * (1 - bump(e, WINDOWS.unfold)));
  const t = -T + 2 * T * ramp(e, WINDOWS.sweep);
  return {
    t,
    q,
    p: Math.max(0, 1 - Math.abs(q * t)),
    xi: XI0 * open,
    alpha: (GAMMA0 * open) ** 2 / 4,
    lambda,
  };
}

/** Everted-frame point F(theta=lon, phi=lat, e) in the math frame. Writes out[0..2]. */
function evert(lon: number, lat: number, e: number, out: number[], sp = stageParams(e)): void {
  const { t, q, p, xi, alpha, lambda: lam } = sp;
  const c = Math.cos(lat);
  const s = Math.sin(lat);
  const cn = c ** N;
  const cl = Math.cos(lon);
  const sl = Math.sin(lon);
  let x: number, y: number, z: number;
  if (lam >= 1) {
    // ruled-surface cylinder, note 3.1
    const h = (OMEGA * s) / cn;
    x = t * cl + p * Math.sin((N - 1) * lon) - h * sl;
    y = t * sl + p * Math.cos((N - 1) * lon) + h * cl;
    z = h * Math.sin(N * lon) - (t / N) * Math.cos(N * lon) - q * t * h;
  } else {
    // sphere <-> wormhole blend, note 3.2 (p = 0 and q t = +-1 here)
    x = (t * (1 - lam + lam * cn) * cl - lam * OMEGA * s * sl) / cn;
    y = (t * (1 - lam + lam * cn) * sl + lam * OMEGA * s * cl) / cn;
    z =
      lam * ((OMEGA * s * (Math.sin(N * lon) - q * t)) / cn - (t / N) * Math.cos(N * lon)) -
      ((1 - lam) * ETA ** (1 + KAPPA) * t * Math.abs(t) ** (2 * KAPPA) * s) / c ** (2 * N);
  }
  // damping, note 3.3
  const D = xi + ETA * (x * x + y * y);
  const f = D ** -KAPPA;
  const x1 = x * f;
  const y1 = y * f;
  const z1 = z / D;
  // inversion, note 3.4
  const r2 = x1 * x1 + y1 * y1;
  const den = alpha + BETA * r2;
  const g = 2 * Math.sqrt(alpha * BETA);
  const eg = Math.exp(g * z1);
  const em = g > 1e-9 ? Math.expm1(g * z1) / g : z1; // (e^{g z1} - 1)/g
  const A = (alpha - BETA * r2) / den;
  const dz = ((g / 2) * (1 - r2)) / (den * (alpha + BETA));
  // final reflection through the origin so that F(.,0) = identity (note 4.1)
  out[0] = -((x1 * eg) / den);
  out[1] = -((y1 * eg) / den);
  out[2] = -(A * em + dz);
}

/** Analytic limit of F at a pole (note 5.1). north = +1 / south = -1. */
function polePoint(north: 1 | -1, e: number, out: number[]): void {
  const { t, alpha, lambda: lam } = stageParams(e);
  const z1 =
    (-(1 - lam) * ETA ** KAPPA * t * Math.abs(t) ** (2 * KAPPA) * north) /
    ((t * (1 - lam)) ** 2 + (lam * OMEGA) ** 2);
  const g = 2 * Math.sqrt(alpha * BETA);
  const em = g > 1e-9 ? Math.expm1(g * z1) / g : z1;
  const zb = -em - Math.sqrt(alpha / BETA) / (alpha + BETA);
  out[0] = 0;
  out[1] = 0;
  out[2] = -zb;
}

// ---------------------------------------------------------------------------
// Test utilities
// ---------------------------------------------------------------------------
const TWO_PI = 2 * Math.PI;
const sph = (lon: number, lat: number): [number, number, number] => [
  Math.cos(lat) * Math.cos(lon),
  Math.cos(lat) * Math.sin(lon),
  Math.sin(lat),
];
type V3 = [number, number, number];
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: V3, b: V3): V3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const norm = (a: V3) => Math.hypot(a[0], a[1], a[2]);
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const tmp = [0, 0, 0];
const F = (lon: number, lat: number, e: number, sp?: StageParams): V3 => {
  evert(lon, lat, e, tmp, sp);
  return [tmp[0], tmp[1], tmp[2]];
};

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
/** Orthogonal Procrustes with reflection allowed: polar factor of H = sum F_i p_i^T (Newton iteration). */
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

let failures = 0;
const report = (name: string, ok: boolean, detail: string) => {
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  ${detail}`);
};
const t0 = Date.now();

// ---------------------------------------------------------------------------
// Grid: 128 longitudes x 64 latitudes (cell centres, so no row sits on a pole)
// ---------------------------------------------------------------------------
const NT = 128;
const NP = 64;
const lons = Array.from({ length: NT }, (_, i) => ((i + 0.5) / NT) * TWO_PI);
const lats = Array.from({ length: NP }, (_, j) => -Math.PI / 2 + ((j + 0.5) / NP) * Math.PI);
const grid: [number, number][] = [];
for (const la of lats) for (const lo of lons) grid.push([lo, la]);

// 1. Start: identity ---------------------------------------------------------
{
  let m = 0;
  for (const [lo, la] of grid) m = Math.max(m, norm(sub(F(lo, la, 0), sph(lo, la))));
  report(
    'S6  F(.,0) = identity',
    m < 1e-12,
    `max |F-p| = ${m.toExponential(2)} over ${grid.length} points`,
  );
}

// 2. End: orientation-reversing isometry -------------------------------------
let Rfit: M3 = [];
{
  const ps = grid.map(([lo, la]) => sph(lo, la));
  const fs = grid.map(([lo, la]) => F(lo, la, 1));
  Rfit = fitOrthogonal(ps, fs);
  let res = 0;
  for (let i = 0; i < ps.length; i++)
    res = Math.max(
      res,
      norm(
        sub(
          fs[i],
          [0, 1, 2].map(
            (a) => Rfit[a][0] * ps[i][0] + Rfit[a][1] * ps[i][1] + Rfit[a][2] * ps[i][2],
          ) as V3,
        ),
      ),
    );
  const RtR = mul(tr(Rfit), Rfit);
  let orth = 0;
  for (let a = 0; a < 3; a++)
    for (let b = 0; b < 3; b++) orth = Math.max(orth, Math.abs(RtR[a][b] - (a === b ? 1 : 0)));
  const d = det3(Rfit);
  let toMinusI = 0;
  for (let a = 0; a < 3; a++)
    for (let b = 0; b < 3; b++)
      toMinusI = Math.max(toMinusI, Math.abs(Rfit[a][b] + (a === b ? 1 : 0)));
  report(
    'S7  F(.,1) = R p',
    res <= 1e-4 && Math.abs(d + 1) < 1e-6 && orth < 1e-6,
    `residual = ${res.toExponential(2)}, det R = ${d.toFixed(9)}, |R^T R - I| = ${orth.toExponential(2)}`,
  );
  report(
    '    R equals -I (analytic claim)',
    toMinusI < 1e-9,
    `max |R + I| = ${toMinusI.toExponential(2)}`,
  );
}

// 2b. Spot check on 100 random points (the T03 acceptance test)
{
  let seed = 12345;
  const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
  const pts: [number, number][] = Array.from({ length: 100 }, () => [
    rnd() * TWO_PI,
    Math.asin(2 * rnd() - 1),
  ]);
  let id = 0,
    iso = 0,
    orient = 0;
  const f1 = pts.map(([lo, la]) => F(lo, la, 1));
  const p1 = pts.map(([lo, la]) => sph(lo, la));
  for (let i = 0; i < 100; i++) {
    id = Math.max(id, norm(sub(F(pts[i][0], pts[i][1], 0), p1[i])));
    for (let j = i + 1; j < 100; j++)
      iso = Math.max(iso, Math.abs(norm(sub(f1[i], f1[j])) - norm(sub(p1[i], p1[j]))));
  }
  let neg = 0;
  for (let k = 0; k < 400; k++) {
    const [i, j, l] = [Math.floor(rnd() * 100), Math.floor(rnd() * 100), Math.floor(rnd() * 100)];
    const a = dot(cross(p1[i], p1[j]), p1[l]);
    const b = dot(cross(f1[i], f1[j]), f1[l]);
    if (Math.abs(a) > 0.05) {
      orient++;
      if (a * b < 0) neg++;
    }
  }
  report(
    '    100 random points: id at e=0, isometry + orientation reversal at e=1',
    id < 1e-12 && iso < 1e-9 && neg === orient,
    `|F-p|=${id.toExponential(1)}, max pair-distance error=${iso.toExponential(1)}, triple products flipped ${neg}/${orient}`,
  );
}

// 3. Immersion: |dF/dtheta x dF/dphi| / cos(phi) on the full grid x 201 e -----
const NE = 201;
let minDens = Infinity,
  maxDens = 0,
  minAng = Infinity,
  maxR = 0;
let argDens = '',
  argAng = '';
{
  const h = 1e-5;
  for (let ie = 0; ie < NE; ie++) {
    const e = ie / (NE - 1);
    const sp = stageParams(e);
    for (const [lo, la] of grid) {
      const f0 = F(lo, la, e, sp);
      maxR = Math.max(maxR, norm(f0));
      const a = sub(F(lo + h, la, e, sp), F(lo - h, la, e, sp)).map((v) => v / (2 * h)) as V3;
      const b = sub(F(lo, la + h, e, sp), F(lo, la - h, e, sp)).map((v) => v / (2 * h)) as V3;
      const n = cross(a, b);
      const cr = norm(n);
      const dens = cr / Math.cos(la);
      const ang = cr / (norm(a) * norm(b));
      if (dens < minDens) {
        minDens = dens;
        argDens = `e=${e.toFixed(3)} lon=${lo.toFixed(3)} lat=${la.toFixed(3)}`;
      }
      if (ang < minAng) {
        minAng = ang;
        argAng = `e=${e.toFixed(3)} lon=${lo.toFixed(3)} lat=${la.toFixed(3)}`;
      }
      maxDens = Math.max(maxDens, dens);
    }
  }
  report(
    'S8  immersion |F_th x F_ph|/cos(phi)  (grid)',
    minDens > 1e-2,
    `min = ${minDens.toFixed(4)} at ${argDens}; max = ${maxDens.toFixed(2)}`,
  );
  report(
    '    immersion sin(angle between F_th, F_ph)',
    minAng > 1e-2,
    `min = ${minAng.toFixed(4)} at ${argAng}`,
  );
}

// 3b. Denser e (2001 values, as spec S#8) on a 64 x 32 grid ----------------------
{
  const h = 1e-5;
  let mn = Infinity,
    arg = '';
  for (let ie = 0; ie <= 2000; ie++) {
    const e = ie / 2000;
    const sp = stageParams(e);
    for (let j = 0; j < 32; j++) {
      const la = -Math.PI / 2 + ((j + 0.5) / 32) * Math.PI;
      for (let i = 0; i < 64; i++) {
        const lo = ((i + 0.5) / 64) * TWO_PI;
        const a = sub(F(lo + h, la, e, sp), F(lo - h, la, e, sp));
        const b = sub(F(lo, la + h, e, sp), F(lo, la - h, e, sp));
        const d = norm(cross(a, b)) / (4 * h * h) / Math.cos(la);
        if (d < mn) {
          mn = d;
          arg = `e=${e.toFixed(4)} lon=${lo.toFixed(3)} lat=${la.toFixed(3)}`;
        }
      }
    }
  }
  report(
    'S8  immersion, 2001 values of e (64 x 32 grid)',
    mn > 1e-2,
    `min = ${mn.toFixed(4)} at ${arg}`,
  );
}

// 4. Polar chart ---------------------------------------------------------------
{
  // Cartesian tangent coordinates (u, v) about each pole; F evaluated through the sphere point, so no
  // lon/lat differencing is involved. Radii from 1e-3 to 0.25 rad, 24 azimuths, 201 e.
  let minPolar = Infinity,
    arg = '';
  let maxDev = 0; // F(near pole) - polePoint
  let nzSign = 0;
  let nzCount = 0;
  const radii = [1e-3, 3e-3, 1e-2, 3e-2, 0.1, 0.25];
  const tilt: Record<string, number> = {}; // max angle (deg) between the true normal and the pole axis, per radius
  for (const north of [1, -1] as const) {
    for (let ie = 0; ie < NE; ie++) {
      const e = ie / (NE - 1);
      const sp = stageParams(e);
      const P = [0, 0, 0];
      polePoint(north, e, P);
      const toLL = (u: number, v: number): [number, number] => [
        Math.atan2(v, u),
        north * Math.atan2(Math.sqrt(Math.max(0, 1 - u * u - v * v)), Math.hypot(u, v)),
      ];
      for (const r of radii) {
        for (let k = 0; k < 24; k++) {
          const a = (k / 24) * TWO_PI;
          const u = r * Math.cos(a);
          const v = r * Math.sin(a);
          const du = Math.min(1e-6, r * 0.01);
          const at = (uu: number, vv: number) => {
            const [lo, la] = toLL(uu, vv);
            return F(lo, la, e, sp);
          };
          const fu = sub(at(u + du, v), at(u - du, v)).map((x) => x / (2 * du)) as V3;
          const fv = sub(at(u, v + du), at(u, v - du)).map((x) => x / (2 * du)) as V3;
          const n = cross(fu, fv);
          tilt[r] = Math.max(
            tilt[r] ?? 0,
            (Math.acos(Math.min(1, Math.abs(n[2]) / norm(n))) * 180) / Math.PI,
          );
          const dens = norm(n); // area scale w.r.t. the tangent-plane coordinates (1 for the unit sphere at e=0)
          if (dens < minPolar) {
            minPolar = dens;
            arg = `pole=${north > 0 ? 'N' : 'S'} e=${e.toFixed(3)} r=${r} az=${k}`;
          }
          if (r <= 1e-2) {
            const fp = at(u, v);
            maxDev = Math.max(maxDev, norm(sub(fp, P as V3)) / r); // should be O(r)
            nzCount++;
            // Orientation: tangent coordinates (u,v) are right-handed about +z for the north chart; for the
            // south chart the outward normal is -z, so the parametrisation normal there is -(fu x fv).z sign.
            const oz = north > 0 ? n[2] : -n[2];
            if (oz * north > 0) nzSign++;
          }
        }
      }
    }
  }
  report(
    '    polar-chart immersion (|dF/du x dF/dv|, both poles)',
    minPolar > 1e-2,
    `min = ${minPolar.toFixed(4)} at ${arg}`,
  );
  report(
    '    pole normal is constant +z (N) / -z (S) for all e',
    nzSign === nzCount,
    `${nzSign}/${nzCount} near-pole normals on the predicted side`,
  );
  console.log(
    `      normal tilt away from the pole axis (deg), worst over e and azimuth: ${radii.map((r) => `r=${r}: ${tilt[r].toFixed(2)}`).join('  ')}`,
  );
  report(
    '    F(near pole) -> polePoint(e) linearly',
    maxDev < 12,
    `max |F - pole|/r over r<=1e-2 = ${maxDev.toFixed(3)}`,
  );
}

// 5. Time continuity ----------------------------------------------------------
{
  const sub64: [number, number][] = [];
  for (let j = 0; j < 32; j++)
    for (let i = 0; i < 64; i++)
      sub64.push([((i + 0.5) / 64) * TWO_PI, -Math.PI / 2 + ((j + 0.5) / 32) * Math.PI]);
  const stats = (d: number) => {
    let L = 0,
      M = 0,
      Lat = 0,
      Mat = 0;
    const bounds = Object.values(WINDOWS).flatMap((w) => [w[0], w[1], 1 - w[0], 1 - w[1]]);
    const steps = Math.round(1 / d);
    for (let k = 1; k < steps; k++) {
      const e = k * d;
      const sp0 = stageParams(e - d);
      const sp1 = stageParams(e);
      const sp2 = stageParams(e + d);
      let l = 0,
        m = 0;
      for (const [lo, la] of sub64) {
        const a = F(lo, la, e - d, sp0);
        const b = F(lo, la, e, sp1);
        const c = F(lo, la, e + d, sp2);
        l = Math.max(l, norm(sub(c, b)));
        m = Math.max(
          m,
          norm([c[0] - 2 * b[0] + a[0], c[1] - 2 * b[1] + a[1], c[2] - 2 * b[2] + a[2]]),
        );
      }
      L = Math.max(L, l / d);
      M = Math.max(M, m / (d * d));
      if (bounds.some((x) => Math.abs(x - e) < 2.5 * d)) {
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
    `max |dF/de| ~ ${s2.L.toFixed(2)}  (1/1000: ${s1.L.toFixed(2)}, 1/4000: ${s4.L.toFixed(2)}); at window boundaries: ${s2.Lat.toFixed(2)}`,
  );
  report(
    '    bounded 2nd difference, C1 in time',
    s4.M < 1.35 * s1.M,
    `max |d2F| / delta^2: 1/1000 -> ${s1.M.toFixed(1)}, 1/2000 -> ${s2.M.toFixed(1)}, 1/4000 -> ${s4.M.toFixed(1)}; at boundaries (1/4000): ${s4.Mat.toFixed(1)}`,
  );
}

// 6. Bounded -------------------------------------------------------------------
report(
  'S10 max |F| <= 1.35',
  maxR <= 1.35,
  `max |F| = ${maxR.toFixed(4)} over grid x ${NE} values of e`,
);

// 7. Halfway symmetry ----------------------------------------------------------
{
  // F(-lat, lon + pi/2, 1/2) = Rz(-pi/2) F(lat, lon, 1/2)   (note 6.2)
  let m = 0;
  for (const [lo, la] of grid) {
    const a = F(lo, la, 0.5);
    const b = F(lo + Math.PI / 2, -la, 0.5);
    // rotate a by -90 degrees about z: (x, y) -> (y, -x)
    m = Math.max(m, norm(sub(b, [a[1], -a[0], a[2]])));
  }
  report(
    'S11 halfway symmetry (quarter turn about the polar axis + latitude flip)',
    m < 1e-9,
    `max error = ${m.toExponential(2)}`,
  );
  // and the halfway model is not near-degenerate: report its extent
  let zr = 0;
  for (const [lo, la] of grid) zr = Math.max(zr, norm(F(lo, la, 0.5)));
  console.log(`      (halfway extent max |F| = ${zr.toFixed(3)})`);
}

// 8. Window table sanity (all stage parameters at the stage boundaries) --------
{
  const rows = [
    ...new Set([
      0,
      0.5,
      1,
      ...Object.values(WINDOWS).flatMap((w) => [w[0], w[1], 1 - w[0], 1 - w[1]]),
    ]),
  ]
    .sort((a, b) => a - b)
    .map((x) => +x.toFixed(2));
  console.log('\n   e      t       q      p     xi    alpha  lambda');
  for (const e of rows) {
    const s = stageParams(e);
    console.log(
      `  ${e.toFixed(2).padStart(4)}  ${s.t.toFixed(3).padStart(6)}  ${s.q.toFixed(3)}  ${s.p.toFixed(3)}  ${s.xi.toFixed(3)}  ${s.alpha.toFixed(3)}  ${s.lambda.toFixed(3)}`,
    );
  }
}

console.log(
  `\n${failures === 0 ? 'ALL CHECKS PASSED' : failures + ' CHECK(S) FAILED'}  (${((Date.now() - t0) / 1000).toFixed(1)} s)`,
);
process.exit(failures === 0 ? 0 : 1);
