import { describe, expect, it } from 'vitest';

import {
  EVERSION_STRIPS,
  EVERT_STAGES,
  IMMERSION_MIN,
  MAX_EVERSION_EXTENT,
  POLE_EPS,
  STAGE_PARAM_COUNT,
  STAGE_WINDOWS,
} from '../constants';
import { spherePoint, TAU } from '../domain';
import { evert, normal, stageParams } from '../thurston';
import { applyMat3, det3, expectClose, kabsch, seededRandom, sphereGrid } from './helpers';
import type { Vec3 } from './helpers';

/*
 * The Thurston oracle — spec §11.1 tests 6–11.
 *
 *   S#6  start     F(·, 0) is the unit sphere
 *   S#7  end       F(·, 1) = R·p with R orthogonal, det −1 (here R = −I)
 *   S#8  immersion |∂θF × ∂φF| / cos φ ≥ IMMERSION_MIN, plus the polar charts
 *   S#9  time      F is C¹ in e (Lipschitz, bounded second difference)
 *   S#10 bounds    max |F| ≤ MAX_EVERSION_EXTENT
 *   S#11 symmetry  the halfway model has dihedral symmetry D₈
 *
 * S#11 is NOT "π/n rotation ∘ reflection" as the spec text says: the symmetries
 * of the halfway model are proper (det +1) — a 2π/8 rotation about the polar
 * axis, and a half turn about the viewer axis composed with the latitude flip
 * (derivation note §8.2). There is also no time-reversal symmetry to test.
 *
 * Margins observed (also in the T08 commit): immersion min 0.0889 at e=0.453,
 * (θ,φ)=(2.160,−0.877) vs IMMERSION_MIN 0.05; polar charts 1.0000; max|F| 1.3353
 * (1.3357 at e=0.16, φ≈0) vs 1.35; max|∂F/∂e| ≈ 14.1; symmetry errors ~1e-15.
 *
 * Everything here is vectorised into Float64Arrays: the oracle caches the frame
 * of the last (φ, e), so each test sweeps one latitude row at a time.
 */

const N = EVERSION_STRIPS;
const PI = Math.PI;
const TIMEOUT = { timeout: 30_000 };

const buf = new Float64Array(3);
const at = (theta: number, phi: number, e: number): Vec3 => {
  evert(theta, phi, e, buf, 0);
  return [buf[0]!, buf[1]!, buf[2]!];
};
const nrm = (theta: number, phi: number, e: number): Vec3 => {
  normal(theta, phi, e, buf, 0);
  return [buf[0]!, buf[1]!, buf[2]!];
};
const sphere = (theta: number, phi: number): Vec3 => {
  const o = new Float64Array(3);
  spherePoint(theta, phi, o, 0);
  return [o[0]!, o[1]!, o[2]!];
};
const norm = (v: ArrayLike<number>): number => Math.hypot(v[0]!, v[1]!, v[2]!);

/**
 * `|∂θF × ∂φF| / cos φ` along one latitude row, central differences with step
 * `h`. Three passes (φ, φ+h, φ−h) so the oracle's one-frame cache is hit for
 * every column. Writes one value per `thetas` entry into `out`.
 */
const SCR = {
  tp: new Float64Array(0),
  tm: new Float64Array(0),
  pp: new Float64Array(0),
  pm: new Float64Array(0),
};
function immersionRow(
  thetas: Float64Array,
  phi: number,
  e: number,
  h: number,
  out: Float64Array,
): void {
  const n = thetas.length;
  if (SCR.tp.length !== n * 3) {
    SCR.tp = new Float64Array(n * 3);
    SCR.tm = new Float64Array(n * 3);
    SCR.pp = new Float64Array(n * 3);
    SCR.pm = new Float64Array(n * 3);
  }
  for (let i = 0; i < n; i++) evert(thetas[i]! + h, phi, e, SCR.tp, 3 * i);
  for (let i = 0; i < n; i++) evert(thetas[i]! - h, phi, e, SCR.tm, 3 * i);
  for (let i = 0; i < n; i++) evert(thetas[i]!, phi + h, e, SCR.pp, 3 * i);
  for (let i = 0; i < n; i++) evert(thetas[i]!, phi - h, e, SCR.pm, 3 * i);
  const k = 1 / (4 * h * h * Math.cos(phi));
  for (let i = 0; i < n; i++) {
    const o = 3 * i;
    const tx = SCR.tp[o]! - SCR.tm[o]!;
    const ty = SCR.tp[o + 1]! - SCR.tm[o + 1]!;
    const tz = SCR.tp[o + 2]! - SCR.tm[o + 2]!;
    const px = SCR.pp[o]! - SCR.pm[o]!;
    const py = SCR.pp[o + 1]! - SCR.pm[o + 1]!;
    const pz = SCR.pp[o + 2]! - SCR.pm[o + 2]!;
    out[i] = Math.hypot(ty * pz - tz * py, tz * px - tx * pz, tx * py - ty * px) * k;
  }
}

/** Longitude cell centres (never on the seam). */
const thetaCentres = (n: number, shift = 0.5): Float64Array => {
  const t = new Float64Array(n);
  for (let i = 0; i < n; i++) t[i] = -PI + ((i + shift) / n) * TAU;
  return t;
};

describe('stageParams (spec §4.3)', () => {
  it('writes the five quintic windows, κ, sin πw, cos πw, then zeros', () => {
    const sp = new Float64Array(STAGE_PARAM_COUNT).fill(7);
    stageParams(0.37, sp);
    // Reference values from the derivation's verification script (thurston-check.ts).
    expectClose(
      sp,
      [1, 1, 0.040510175781250025, 0, 0, 1, 0.12692319811186592, 0.9919125474461225],
      1e-12,
      'e = 0.37',
    );
    stageParams(0.5, sp);
    expect(sp[2]).toBeCloseTo(0.5, 15);
    expect(sp[6]).toBeCloseTo(1, 12);
    expect(Math.abs(sp[7]!)).toBeLessThan(1e-12);
  });

  it('is 0 before and 1 after each window, monotone, and honours the offset', () => {
    const lo = new Float64Array(STAGE_PARAM_COUNT);
    const hi = new Float64Array(STAGE_PARAM_COUNT);
    const padded = new Float64Array(STAGE_PARAM_COUNT + 3);
    stageParams(0, lo);
    stageParams(1, hi);
    for (let k = 0; k < EVERT_STAGES.length; k++) {
      expect(lo[k]).toBe(0);
      expect(hi[k]).toBe(1);
    }
    expect([lo[5], hi[5]]).toEqual([0, 0]);
    let prev = new Float64Array(STAGE_PARAM_COUNT);
    const cur = new Float64Array(STAGE_PARAM_COUNT);
    for (let i = 1; i <= 200; i++) {
      stageParams(i / 200, cur);
      for (let k = 0; k < 5; k++) expect(cur[k]! >= prev[k]!).toBe(true);
      prev = Float64Array.from(cur);
    }
    stageParams(0.42, padded, 3);
    stageParams(0.42, cur);
    expectClose(padded.subarray(3), cur, 0, 'offset');
    expect(STAGE_WINDOWS).toHaveLength(5);
  });
});

describe('S#6 — start: F(·, 0) is the unit sphere', () => {
  it('matches spherePoint to 1e-9 on a grid including the poles and the seam', () => {
    let worst = 0;
    for (const { theta, phi } of sphereGrid(128, 65)) {
      const p = sphere(theta, phi);
      const f = at(theta, phi, 0);
      worst = Math.max(worst, Math.hypot(f[0] - p[0], f[1] - p[1], f[2] - p[2]));
    }
    expect(worst).toBeLessThan(1e-9);
  });
});

describe('S#7 — end: F(·, 1) = R·p with R orthogonal, det R = −1', () => {
  it('is the antipodal map (R = −I)', () => {
    const P: Vec3[] = [];
    const Q: Vec3[] = [];
    for (const { theta, phi } of sphereGrid(96, 48, { excludePoles: true })) {
      P.push(sphere(theta, phi));
      Q.push(at(theta, phi, 1));
    }
    const R = kabsch(P, Q, { allowReflection: true });
    let residual = 0;
    for (let i = 0; i < P.length; i++) {
      const r = applyMat3(R, P[i]!);
      residual = Math.max(residual, Math.hypot(r[0] - Q[i]![0], r[1] - Q[i]![1], r[2] - Q[i]![2]));
    }
    expect(residual).toBeLessThan(1e-9);
    expect(det3(R)).toBeCloseTo(-1, 9);
    expectClose(R, [-1, 0, 0, 0, -1, 0, 0, 0, -1], 1e-9, 'R = −I');
  });
});

describe('reference values (derivation script, thurston-check.ts)', () => {
  // [θ, φ, e, F] from the independent implementation the derivation verified.
  const REF: [number, number, number, Vec3][] = [
    [0.3, 0.2, 0.1, [0.2439880581050152, -0.24710397197597309, 1.1424870361865187]],
    [-2.1, 0.9, 0.33, [-0.4674517935735388, 0.10835067156766776, -0.28820347875876934]],
    [1.0, -0.5, 0.5, [0.4654011234146298, -0.03256833884154285, 0.103160280014541]],
    [2.9, -1.3, 0.8, [-0.07221737595727733, -0.9302107228464186, 0.2937220344619044]],
    [-0.7, 0.05, 0.97, [0.6358273085352418, 0.04982774523535512, -0.7662608072856376]],
    [0.4, 1.5, 0.6, [-0.010085890536799577, 0.987383892497079, -0.12270025911285672]],
    [1.9, -1.5, 0.2, [0.08146470623791775, 0.42115052214234333, -0.02783122387601281]],
    [-3.0, 0.6, 1.0, [0.11647136862814927, 0.5646424733950354, 0.8170760659376962]],
  ];
  it('agrees to 1e-12', () => {
    for (const [theta, phi, e, f] of REF) {
      expectClose(at(theta, phi, e), f, 1e-12, `F(${theta}, ${phi}, ${e})`);
    }
  });
  it('is independent of the call order (the frame cache is invisible)', () => {
    const rnd = seededRandom(11);
    for (let i = 0; i < 200; i++) {
      const th = -PI + rnd() * TAU;
      const ph = -1.55 + rnd() * 3.1;
      const e = rnd();
      const a = at(th, ph, e);
      at(th + 0.1, ph + 0.1, 1 - e); // poison the cache
      const b = at(th, ph, e);
      expectClose(a, b, 0, 'cache');
    }
  });
});

describe('poles', () => {
  it('are fixed on the polar axis: (0, ∓Z_N, 0), Z_N = (1−q)(1−2p) − q, for every θ', () => {
    const sp = new Float64Array(STAGE_PARAM_COUNT);
    for (let i = 0; i <= 100; i++) {
      const e = i / 100;
      stageParams(e, sp);
      const zn = (1 - sp[3]!) * (1 - 2 * sp[1]!) - sp[3]!;
      for (const th of [-PI, -1.3, 0, 0.77, 3]) {
        expectClose(at(th, PI / 2, e), [0, -zn, 0], 1e-12, `north e=${e}`);
        expectClose(at(th, -PI / 2, e), [0, zn, 0], 1e-12, `south e=${e}`);
      }
    }
  });
});

describe('S#8 — immersion', () => {
  it(
    `|∂θF × ∂φF|/cos φ ≥ IMMERSION_MIN (${IMMERSION_MIN}) on a latitude/longitude grid at 201 values of e`,
    TIMEOUT,
    () => {
      const NT = 64;
      const NP = 32;
      const thetas = thetaCentres(NT);
      const row = new Float64Array(NT);
      let min = Infinity;
      let where = '';
      for (let ie = 0; ie <= 200; ie++) {
        const e = ie / 200;
        for (let j = 0; j < NP; j++) {
          const phi = -PI / 2 + ((j + 0.5) / NP) * PI;
          immersionRow(thetas, phi, e, 1e-5, row);
          for (let i = 0; i < NT; i++) {
            if (row[i]! < min) {
              min = row[i]!;
              where = `e=${e} θ=${thetas[i]!.toFixed(3)} φ=${phi.toFixed(3)}`;
            }
          }
        }
      }
      expect(min, where).toBeGreaterThanOrEqual(IMMERSION_MIN);
    },
  );

  it(
    'holds on thin latitude rings (0.5°) where the profile and size envelopes have kinks',
    TIMEOUT,
    () => {
      const NT = 48; // 6 per strip is enough for a ring sweep at 0.5° latitude spacing
      const thetas = thetaCentres(NT, 0.29);
      const row = new Float64Array(NT);
      const NPH = 180;
      let min = Infinity;
      let where = '';
      for (let ie = 0; ie <= 40; ie++) {
        const e = ie / 40;
        for (let j = 0; j < NPH; j++) {
          const phi = -PI / 2 + ((j + 0.31) / NPH) * PI;
          immersionRow(thetas, phi, e, 1e-5, row);
          for (let i = 0; i < NT; i++) {
            if (row[i]! < min) {
              min = row[i]!;
              where = `e=${e} θ=${thetas[i]!.toFixed(3)} φ=${phi.toFixed(3)}`;
            }
          }
        }
      }
      expect(min, where).toBeGreaterThanOrEqual(IMMERSION_MIN);
    },
  );

  it('holds at the worst known points of the surface, at fine e (2001 values)', TIMEOUT, () => {
    // The derivation's pattern search put the true minimum (≈ 0.0887) at
    // e ≈ 0.453, (θ, φ) ≈ (2.16, −0.877), with other basins near e ≈ 0.78,
    // φ ≈ ∓0.83; sweep e finely at those.
    const spots: [number, number][] = [
      [2.1598, -0.8768],
      [0.9817, -0.8176],
      [-1.355, -0.835],
      [0.54, -0.834],
      [-2.921, 0.81],
      [2.143, -0.884],
      [-2.143, 0.818],
    ];
    const thetas = Float64Array.from(spots.map((s) => s[0]));
    const row = new Float64Array(1);
    let min = Infinity;
    let where = '';
    for (let ie = 0; ie <= 2000; ie++) {
      const e = ie / 2000;
      for (const [th, ph] of spots) {
        thetas[0] = th;
        immersionRow(thetas.subarray(0, 1), ph, e, 1e-5, row);
        if (row[0]! < min) {
          min = row[0]!;
          where = `e=${e} θ=${th} φ=${ph}`;
        }
      }
    }
    expect(min, where).toBeGreaterThanOrEqual(IMMERSION_MIN);
  });

  it(
    'polar charts: the tangent-plane map about each pole is an immersion (radii 1e-3 … 0.25)',
    TIMEOUT,
    () => {
      // In the (θ, φ) chart the pole is singular, so check in coordinates (x, z)
      // on the tangent plane of the pole instead — the mesh's polar fans live there.
      const radii = [1e-3, 3e-3, 1e-2, 2e-2, 3e-2, 5e-2, 0.1, 0.25];
      const F = (sx: number, x: number, z: number, e: number, out: Float64Array, off: number) => {
        const y = sx * -Math.sqrt(Math.max(0, 1 - x * x - z * z)); // north pole is (0, −1, 0)
        evert(Math.atan2(x, z), Math.asin(-y), e, out, off);
      };
      const d = new Float64Array(12);
      let min = Infinity;
      let where = '';
      let wrongSide = 0;
      for (const sx of [1, -1]) {
        for (let ie = 0; ie <= 40; ie++) {
          const e = ie / 40;
          for (const r of radii) {
            const h = Math.min(1e-6, r * 0.01);
            for (let k = 0; k < 16; k++) {
              const a = (k / 16) * TAU + 0.1;
              const x = r * Math.cos(a);
              const z = r * Math.sin(a);
              F(sx, x + h, z, e, d, 0);
              F(sx, x - h, z, e, d, 3);
              F(sx, x, z + h, e, d, 6);
              F(sx, x, z - h, e, d, 9);
              const fx = [0, 1, 2].map((c) => (d[c]! - d[3 + c]!) / (2 * h));
              const fz = [0, 1, 2].map((c) => (d[6 + c]! - d[9 + c]!) / (2 * h));
              // (x, z) is right-handed with outward at the north pole; at the south
              // pole the winding-consistent order is (z, x).
              const [u, w] = sx > 0 ? [fx, fz] : [fz, fx];
              const cx = u[1]! * w[2]! - u[2]! * w[1]!;
              const cy = u[2]! * w[0]! - u[0]! * w[2]!;
              const cz = u[0]! * w[1]! - u[1]! * w[0]!;
              const dens = Math.hypot(cx, cy, cz);
              if (dens < min) {
                min = dens;
                where = `${sx > 0 ? 'N' : 'S'} e=${e} r=${r}`;
              }
              // The winding normal at a pole is -y (north) / +y (south) at every e.
              if (cy * sx > 0) wrongSide++;
            }
          }
        }
      }
      expect(min, where).toBeGreaterThanOrEqual(IMMERSION_MIN);
      expect(wrongSide).toBe(0);
    },
  );
});

describe('normal (spec §4.4)', () => {
  /** Reference winding normal by central differences with step `h` and no pole logic. */
  const fdNormal = (theta: number, phi: number, e: number, h: number): Vec3 => {
    const tp = at(theta + h, phi, e);
    const tm = at(theta - h, phi, e);
    const pp = at(theta, phi + h, e);
    const pm = at(theta, phi - h, e);
    const t = [tp[0] - tm[0], tp[1] - tm[1], tp[2] - tm[2]];
    const p = [pp[0] - pm[0], pp[1] - pm[1], pp[2] - pm[2]];
    const n: Vec3 = [
      p[1]! * t[2]! - p[2]! * t[1]!,
      p[2]! * t[0]! - p[0]! * t[2]!,
      p[0]! * t[1]! - p[1]! * t[0]!,
    ];
    const l = norm(n);
    return [n[0] / l, n[1] / l, n[2] / l];
  };
  const angle = (a: Vec3, b: Vec3): number =>
    Math.acos(Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2])));

  it('is outward at e = 0 and inward at e = 1', () => {
    // At e = 1 the surface is −p, so "inward" (toward the origin) is +p.
    let worst0 = 0;
    let worst1 = 0;
    for (const { theta, phi } of sphereGrid(64, 33)) {
      const p = sphere(theta, phi);
      const n0 = nrm(theta, phi, 0);
      worst0 = Math.max(worst0, Math.hypot(n0[0] - p[0], n0[1] - p[1], n0[2] - p[2]));
      const n1 = nrm(theta, phi, 1);
      worst1 = Math.max(worst1, Math.hypot(n1[0] - p[0], n1[1] - p[1], n1[2] - p[2]));
    }
    expect(worst0).toBeLessThan(1e-6);
    expect(worst1).toBeLessThan(1e-6);
  });

  it('is a unit vector that matches an independent finite difference away from the poles', () => {
    const rnd = seededRandom(5);
    let worst = 0;
    for (let i = 0; i < 3000; i++) {
      const th = -PI + rnd() * TAU;
      const ph = (rnd() - 0.5) * 2 * (PI / 2 - POLE_EPS - 0.01);
      const e = rnd();
      const n = nrm(th, ph, e);
      expect(Math.abs(norm(n) - 1)).toBeLessThan(1e-12);
      worst = Math.max(worst, angle(n, fdNormal(th, ph, e, 3e-6)));
    }
    expect(worst).toBeLessThan(2e-3);
  });

  it('is exact inside the pole band (|φ| > π/2 − POLE_EPS) and constant at the poles', () => {
    const rnd = seededRandom(9);
    let worst = 0;
    for (let i = 0; i < 4000; i++) {
      const th = -PI + rnd() * TAU;
      const sx = rnd() < 0.5 ? 1 : -1;
      const ph = sx * (PI / 2 - 1e-3 - rnd() * (POLE_EPS - 1e-3));
      const e = rnd();
      worst = Math.max(worst, angle(nrm(th, ph, e), fdNormal(th, ph, e, 1e-6)));
    }
    expect(worst).toBeLessThan(1e-4);
    for (let i = 0; i <= 20; i++) {
      for (const th of [-PI, 0.4, 2.2]) {
        expect(nrm(th, PI / 2, i / 20)).toEqual([0, -1, 0]);
        expect(nrm(th, -PI / 2, i / 20)).toEqual([0, 1, 0]);
      }
    }
  });

  it('is continuous across the pole-band boundary', () => {
    let worst = 0;
    for (const sx of [1, -1]) {
      const edge = sx * (PI / 2 - POLE_EPS);
      for (let i = 0; i <= 20; i++) {
        const e = i / 20;
        for (const th of [-2.5, -0.9, 0.3, 1.7]) {
          worst = Math.max(
            worst,
            angle(nrm(th, edge - sx * 1e-4, e), nrm(th, edge + sx * 1e-4, e)),
          );
        }
      }
    }
    expect(worst).toBeLessThan(5e-3);
  });
});

describe('S#9 — continuity in e', () => {
  it('is Lipschitz with a bounded second difference (C¹ at every window boundary)', TIMEOUT, () => {
    const NT = 32;
    const NP = 16;
    const thetas = thetaCentres(NT);
    const A = new Float64Array(3);
    const B = new Float64Array(3);
    const C = new Float64Array(3);
    const bounds = STAGE_WINDOWS.flatMap((w) => [w[0], w[1]]);
    const es = [...new Set([...bounds, ...Array.from({ length: 41 }, (_, i) => i / 40)])];
    const stats = (d: number) => {
      let lip = 0;
      let second = 0;
      for (const e0 of es) {
        const e = Math.min(1 - d, Math.max(d, e0));
        for (let j = 0; j < NP; j++) {
          const phi = -PI / 2 + ((j + 0.5) / NP) * PI;
          for (let i = 0; i < NT; i++) {
            evert(thetas[i]!, phi, e - d, A, 0);
            evert(thetas[i]!, phi, e, B, 0);
            evert(thetas[i]!, phi, e + d, C, 0);
            lip = Math.max(lip, Math.hypot(C[0]! - B[0]!, C[1]! - B[1]!, C[2]! - B[2]!) / d);
            second = Math.max(
              second,
              Math.hypot(
                C[0]! - 2 * B[0]! + A[0]!,
                C[1]! - 2 * B[1]! + A[1]!,
                C[2]! - 2 * B[2]! + A[2]!,
              ) /
                (d * d),
            );
          }
        }
      }
      return { lip, second };
    };
    const coarse = stats(1 / 200);
    const fine = stats(1 / 3200);
    expect(fine.lip).toBeLessThan(20); // ≈ 14.4 measured
    // A kink would make the second difference grow like 1/δ as δ shrinks.
    expect(fine.second).toBeLessThan(1.35 * coarse.second);
  });
});

describe('S#10 — bounded', () => {
  it(`max |F| ≤ MAX_EVERSION_EXTENT (${MAX_EVERSION_EXTENT}) for all e`, TIMEOUT, () => {
    const NT = N * 32; // 32 samples per strip resolve the crest
    const NP = 96;
    const thetas = thetaCentres(NT, 0.37);
    const o = new Float64Array(3);
    let max = 0;
    let where = '';
    const es = new Set<number>([0.16]);
    for (let i = 0; i <= 40; i++) es.add(i / 40);
    for (const e of es) {
      for (let j = 0; j <= NP; j++) {
        const phi = -PI / 2 + (j / NP) * PI;
        for (let i = 0; i < NT; i++) {
          evert(thetas[i]!, phi, e, o, 0);
          const r = norm(o);
          if (r > max) {
            max = r;
            where = `e=${e} φ=${phi.toFixed(3)}`;
          }
        }
      }
    }
    expect(max, where).toBeLessThanOrEqual(MAX_EVERSION_EXTENT);
    expect(max).toBeGreaterThan(1.3); // the crests do reach out: the bound is not vacuous
  });
});

describe('S#11 — the halfway model has dihedral symmetry D₈', () => {
  const c = Math.cos(TAU / N);
  const s = Math.sin(TAU / N);
  /** Rotation about the polar axis (body y) by 2π/8, as the matrix the derivation uses. */
  const ry = (v: Vec3): Vec3 => [v[0] * c + v[2] * s, v[1], -v[0] * s + v[2] * c];
  const dist = (a: Vec3, b: Vec3): number => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  const grid = sphereGrid(64, 33);

  it('(a) F(θ + 2π/8, φ) = Ry(2π/8)·F(θ, φ) — at every e', () => {
    for (const e of [0.5, 0.2, 0.83]) {
      let worst = 0;
      for (const { theta, phi } of grid) {
        worst = Math.max(worst, dist(at(theta + TAU / N, phi, e), ry(at(theta, phi, e))));
      }
      expect(worst).toBeLessThan(1e-9);
    }
  });

  it('(b) F(−θ, −φ) = diag(−1, −1, 1)·F(θ, φ)', () => {
    // The derivation calls this one special to e = ½; numerically it holds at
    // every e (the profile Σ(2−u) is Σ(u) with the polar axis flipped), so the
    // halfway model needs no more than (a)–(c) and we check it at several e.
    for (const e of [0.5, 0.2, 0.8]) {
      let worst = 0;
      for (const { theta, phi } of grid) {
        const f = at(theta, phi, e);
        worst = Math.max(worst, dist(at(-theta, -phi, e), [-f[0], -f[1], f[2]]));
      }
      expect(worst).toBeLessThan(1e-9);
    }
  });

  it('(c) F(−θ + 2πk/8, −φ) = Ry(2πk/8)·diag(−1, −1, 1)·F(θ, φ)', () => {
    let worst = 0;
    for (const { theta, phi } of grid) {
      const f = at(theta, phi, 0.5);
      worst = Math.max(worst, dist(at(-theta + TAU / N, -phi, 0.5), ry([-f[0], -f[1], f[2]])));
    }
    expect(worst).toBeLessThan(1e-9);
  });
});
