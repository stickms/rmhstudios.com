/**
 * T13 — orientation, mirror correction and alignment (spec §11.1 tests 12–14).
 *
 * ## Which oracle runs
 *
 * `ORACLE` below is the single swappable import. It is the real Thurston oracle
 * (`thurston.ts`, T08) when that is implemented, and otherwise a mock whose end
 * map is the true one (`F(p, 1) = −p`, the antipodal reflection) and whose
 * interior is a straight shrink through the origin (`(1 − 2e)·p`). The mock is
 * NOT an immersion, so it cannot stand in for the immersion tests — but the
 * orientation facts under test depend only on `e = 0` and `e = 1`, where the mock
 * and the real oracle agree. The name of the oracle that ran is logged once.
 */

import { describe, expect, it } from 'vitest';

import { GLOBE_RADIUS_FRACTION } from '../constants';
import { SPIN_AXIS, TAU, spherePoint } from '../domain';
import { buildMesh } from '../mesh';
import { cameraFor, projectToViewport } from '../morph';
import { afterDomainTransform, alignAngle, fitEndIsometry } from '../orientation';
import { PROJECTIONS } from '../projections';
import { Timeline } from '../timeline';
import { evert as realEvert } from '../thurston';
import {
  PROJECTION_IDS,
  type EvertFn,
  type Mat3,
  type TimelineSnapshot,
  type Vec3,
  type Viewport,
} from '../types';
import { jacobian2, seededRandom } from './helpers';

/* ── The oracle: real if T08 has landed, else the mock ────────────────────── */

const mockEvert: EvertFn = (theta, phi, e, out, offset = 0) => {
  spherePoint(theta, phi, out, offset);
  const k = 1 - 2 * e;
  out[offset] = out[offset]! * k;
  out[offset + 1] = out[offset + 1]! * k;
  out[offset + 2] = out[offset + 2]! * k;
};

function pickOracle(): { name: string; F: EvertFn } {
  try {
    realEvert(0, 0, 1, new Float64Array(3), 0);
    return { name: 'real (thurston.ts, T08)', F: realEvert };
  } catch (e) {
    if (!(e instanceof Error) || !/not implemented/.test(e.message)) throw e;
    return { name: 'mock (F(p, e) = (1 − 2e)·p)', F: mockEvert };
  }
}
const ORACLE = pickOracle();
console.warn(`[orientation.test] oracle: ${ORACLE.name}`);

/* ── Small linear algebra on column-major Mat3 ────────────────────────────── */

function mul(M: Mat3, x: number, y: number, z: number): [number, number, number] {
  return [
    M[0]! * x + M[3]! * y + M[6]! * z,
    M[1]! * x + M[4]! * y + M[7]! * z,
    M[2]! * x + M[5]! * y + M[8]! * z,
  ];
}

function det(M: Mat3): number {
  return (
    M[0]! * (M[4]! * M[8]! - M[7]! * M[5]!) -
    M[3]! * (M[1]! * M[8]! - M[7]! * M[2]!) +
    M[6]! * (M[1]! * M[5]! - M[4]! * M[2]!)
  );
}

/** `Ry(s)·v`, the same rotation as `viewOf`'s yaw in `lib/globe.ts`. */
function ry(s: number, v: readonly [number, number, number]): [number, number, number] {
  const c = Math.cos(s);
  const sn = Math.sin(s);
  return [v[0] * c + v[2] * sn, v[1], -v[0] * sn + v[2] * c];
}

const DEG = Math.PI / 180;
/** Angle between two 3-vectors, degrees. */
function angleDeg(a: readonly number[], b: readonly number[]): number {
  const d = a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!;
  return (
    (Math.acos(Math.min(1, Math.max(-1, d / (Math.hypot(...a) * Math.hypot(...b))))) * 180) /
    Math.PI
  );
}

const R_ANTIPODE = new Float64Array([-1, 0, 0, 0, -1, 0, 0, 0, -1]);
/** A generic improper isometry whose `R·c` is not on the viewer axis: `−Ry(0.7)`. */
function genericReflection(): Mat3 {
  const c = Math.cos(0.7);
  const s = Math.sin(0.7);
  // Ry(0.7) column-major: columns (c,0,−s), (0,1,0), (s,0,c); negated.
  return new Float64Array([-c, 0, s, 0, -1, 0, -s, 0, -c]);
}

/* ── fitEndIsometry ───────────────────────────────────────────────────────── */

describe('fitEndIsometry', () => {
  it('finds R = −I from the oracle, with det −1 and a tiny residual', () => {
    const fit = fitEndIsometry(ORACLE.F);
    expect(fit.det).toBeCloseTo(-1, 9);
    expect(fit.residual).toBeLessThan(1e-4);
    for (let i = 0; i < 9; i++) expect(fit.R[i]).toBeCloseTo(R_ANTIPODE[i]!, 6);
  });

  it('recovers an arbitrary reflection exactly (Kabsch allowing reflection)', () => {
    const R = genericReflection();
    const F: EvertFn = (theta, phi, _e, out, offset = 0) => {
      const p = new Float64Array(3);
      spherePoint(theta, phi, p);
      const v = mul(R, p[0]!, p[1]!, p[2]!);
      out[offset] = v[0];
      out[offset + 1] = v[1];
      out[offset + 2] = v[2];
    };
    const fit = fitEndIsometry(F);
    for (let i = 0; i < 9; i++) expect(fit.R[i]).toBeCloseTo(R[i]!, 9);
    expect(fit.det).toBeCloseTo(-1, 9);
    expect(fit.residual).toBeLessThan(1e-12);
  });

  it('refuses an end map that is not an isometry, or not a reflection', () => {
    const scaled: EvertFn = (t, p, _e, out, o = 0) => {
      spherePoint(t, p, out, o);
      out[o] = out[o]! * -1.01;
      out[o + 1] = out[o + 1]! * -1.01;
      out[o + 2] = out[o + 2]! * -1.01;
    };
    expect(() => fitEndIsometry(scaled)).toThrow(/isometry/);
    const proper: EvertFn = (t, p, _e, out, o = 0) => spherePoint(t, p, out, o);
    expect(() => fitEndIsometry(proper)).toThrow(/reflection/);
  });

  it('memoises the default-oracle fit (same object) — real oracle only', () => {
    if (ORACLE.F !== realEvert) return; // the default oracle IS the stub until T08 lands
    expect(fitEndIsometry()).toBe(fitEndIsometry());
  });
});

/* ── S#12 — the sides flip ────────────────────────────────────────────────── */

describe('S#12 outward normals by winding', () => {
  const mesh = buildMesh(48, 24);
  const verts = new Float64Array(mesh.vertexCount * 3);

  /** The count of triangles whose winding normal · centroid has the wrong sign. */
  function wrongSigned(e: number, wantPositive: boolean): { wrong: number; total: number } {
    const p = new Float64Array(3);
    for (let i = 0; i < mesh.vertexCount; i++) {
      ORACLE.F(mesh.domain[2 * i]!, mesh.domain[2 * i + 1]!, e, p, 0);
      verts.set(p, 3 * i);
    }
    let wrong = 0;
    let total = 0;
    for (let t = 0; t < mesh.indices.length; t += 3) {
      const a = mesh.indices[t]! * 3;
      const b = mesh.indices[t + 1]! * 3;
      const c = mesh.indices[t + 2]! * 3;
      const ux = verts[b]! - verts[a]!;
      const uy = verts[b + 1]! - verts[a + 1]!;
      const uz = verts[b + 2]! - verts[a + 2]!;
      const vx = verts[c]! - verts[a]!;
      const vy = verts[c + 1]! - verts[a + 1]!;
      const vz = verts[c + 2]! - verts[a + 2]!;
      const n = [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx];
      const cen = [
        (verts[a]! + verts[b]! + verts[c]!) / 3,
        (verts[a + 1]! + verts[b + 1]! + verts[c + 1]!) / 3,
        (verts[a + 2]! + verts[b + 2]! + verts[c + 2]!) / 3,
      ];
      const nf = n[0]! * cen[0]! + n[1]! * cen[1]! + n[2]! * cen[2]!;
      total++;
      if (wantPositive ? nf <= 0 : nf >= 0) wrong++;
    }
    return { wrong, total };
  }

  it('at e = 0 every triangle faces outward (n·F > 0)', () => {
    const { wrong, total } = wrongSigned(0, true);
    expect(total).toBeGreaterThan(1000);
    expect(wrong).toBe(0);
  });

  it('at e = 1 every triangle faces inward (n·F < 0): the visible side is `after`', () => {
    expect(wrongSigned(1, false).wrong).toBe(0);
  });

  it('the analytic normal ∂φF × ∂θF agrees (left-handed body frame) on interior points', () => {
    const h = 1e-5;
    const f = (t: number, p: number, e: number): [number, number, number] => {
      const o = new Float64Array(3);
      ORACLE.F(t, p, e, o, 0);
      return [o[0]!, o[1]!, o[2]!];
    };
    for (const [e, sign] of [
      [0, 1],
      [1, -1],
    ] as const) {
      for (let i = 0; i < 12; i++) {
        for (let j = 1; j < 6; j++) {
          const t = -Math.PI + (i + 0.5) * (TAU / 12);
          const p = -Math.PI / 2 + (j / 6) * Math.PI;
          const dT = f(t + h, p, e).map((x, k) => (x - f(t - h, p, e)[k]!) / (2 * h));
          const dP = f(t, p + h, e).map((x, k) => (x - f(t, p - h, e)[k]!) / (2 * h));
          const n = [
            dP[1]! * dT[2]! - dP[2]! * dT[1]!,
            dP[2]! * dT[0]! - dP[0]! * dT[2]!,
            dP[0]! * dT[1]! - dP[1]! * dT[0]!,
          ];
          const F = f(t, p, e);
          expect(Math.sign(n[0]! * F[0] + n[1]! * F[1] + n[2]! * F[2])).toBe(sign);
        }
      }
    }
  });
});

/* ── The compose chain shared by S#13 and S#14 ────────────────────────────── */

const VIEWPORT: Viewport = { w: 1440, h: 900, dpr: 1 };
const RADIUS = GLOBE_RADIUS_FRACTION * Math.min(VIEWPORT.w, VIEWPORT.h);

/**
 * Surface-parameter point `(θ, φ)` → screen px after the end map, the spin
 * `spin` (tilt level), and the perspective camera of `morph.ts`.
 */
function screenOf(R: Mat3, spin: number, theta: number, phi: number): [number, number] {
  const p = new Float64Array(3);
  spherePoint(theta, phi, p);
  const f = mul(R, p[0]!, p[1]!, p[2]!);
  const x = ry(spin, f);
  const cam = cameraFor(VIEWPORT, RADIUS);
  const out = new Float64Array(2);
  projectToViewport(cam, [x[0] * RADIUS, x[1] * RADIUS, x[2] * RADIUS], out);
  return [out[0]!, out[1]!];
}

/** Camera-space depth of the surface point after spin (>0 = toward the viewer). */
function depthOf(R: Mat3, spin: number, theta: number, phi: number): number {
  const p = new Float64Array(3);
  spherePoint(theta, phi, p);
  const f = mul(R, p[0]!, p[1]!, p[2]!);
  return ry(spin, f)[2];
}

describe('S#13 no mirror; page-up is screen-up', () => {
  const R = fitEndIsometry(ORACLE.F).R;
  const thetaAlign = alignAngle(R);
  const spin = thetaAlign + TAU; // θ_end = θ_align + 2π·k
  const M = afterDomainTransform(R, SPIN_AXIS, thetaAlign);

  it('M_after is orthogonal with det −1', () => {
    expect(det(M)).toBeCloseTo(-1, 12);
    for (let c = 0; c < 3; c++) {
      for (let d = 0; d < 3; d++) {
        let dot = 0;
        for (let r = 0; r < 3; r++) dot += M[c * 3 + r]! * M[d * 3 + r]!;
        expect(dot).toBeCloseTo(c === d ? 1 : 0, 12);
      }
    }
  });

  /**
   * Violations of (no mirror, page-up ↦ screen-up, page-right ↦ screen-right)
   * at 100 seeded points of the visible hemisphere, for `projection` and the
   * page-lookup matrix `Mat`.
   */
  function violations(projectionId: (typeof PROJECTION_IDS)[number], Mat: Mat3, Rend: Mat3) {
    const proj = PROJECTIONS[projectionId];
    const fit = proj.fit(VIEWPORT.w, VIEWPORT.h);
    const rnd = seededRandom(1312);
    const uvOf = (t: number, ph: number): [number, number] => {
      const p = new Float64Array(3);
      spherePoint(t, ph, p);
      const q = mul(Mat, p[0]!, p[1]!, p[2]!);
      const out = new Float64Array(2);
      proj.extended(Math.atan2(q[0], q[2]), Math.asin(Math.max(-1, Math.min(1, -q[1]))), fit, out);
      return [out[0]!, out[1]!];
    };
    const covered = (t: number, ph: number) => {
      const p = new Float64Array(3);
      spherePoint(t, ph, p);
      const q = mul(Mat, p[0]!, p[1]!, p[2]!);
      const th = Math.atan2(q[0], q[2]);
      const phq = Math.asin(Math.max(-1, Math.min(1, -q[1])));
      return proj.forward(th, phq, fit, new Float64Array(2)) && !proj.singular(th, phq, fit);
    };
    let n = 0;
    let tries = 0;
    const bad = { mirror: 0, up: 0, right: 0 };
    const h = 1e-5;
    while (n < 100 && tries++ < 100_000) {
      const t = (rnd() * 2 - 1) * Math.PI;
      const ph = (rnd() * 2 - 1) * 1.35;
      // Visible hemisphere, comfortably off the limb and clear of the seam.
      if (depthOf(Rend, spin, t, ph) < 0.2) continue;
      if (Math.abs(Math.abs(t) - Math.PI) < 0.02) continue;
      if (
        ![
          [t, ph],
          [t + 2 * h, ph],
          [t - 2 * h, ph],
          [t, ph + 2 * h],
          [t, ph - 2 * h],
        ].every(([a, b]) => covered(a!, b!))
      ) {
        continue;
      }
      n++;
      const A = jacobian2(uvOf, t, ph, h); // d(uv)/d(θ, φ), columns
      const B = jacobian2((a, b) => screenOf(Rend, spin, a, b), t, ph, h);
      const detA = A.dTheta[0] * A.dPhi[1] - A.dPhi[0] * A.dTheta[1];
      const detB = B.dTheta[0] * B.dPhi[1] - B.dPhi[0] * B.dTheta[1];
      if (!(detA / detB > 0)) bad.mirror++;
      // Screen displacement for a unit page step: dS = B · A⁻¹ · d.
      const inv = (d: [number, number]): [number, number] => [
        (A.dPhi[1] * d[0] - A.dPhi[0] * d[1]) / detA,
        (-A.dTheta[1] * d[0] + A.dTheta[0] * d[1]) / detA,
      ];
      const toScreen = (d: [number, number]): [number, number] => {
        const w = inv(d);
        return [B.dTheta[0] * w[0] + B.dPhi[0] * w[1], B.dTheta[1] * w[0] + B.dPhi[1] * w[1]];
      };
      if (!(toScreen([0, -1])[1] < 0)) bad.up++; // page-up (v decreases) ↦ screen y decreases
      if (!(toScreen([1, 0])[0] > 0)) bad.right++;
    }
    return { n, tries, ...bad };
  }

  it.each(PROJECTION_IDS)('%s: det > 0, page-up ↦ screen-up, at 100 visible points', (id) => {
    const v = violations(id, M, R);
    expect(v.n).toBe(100);
    expect(v).toMatchObject({ mirror: 0, up: 0, right: 0 });
  });

  it.each(PROJECTION_IDS)(
    '%s: the check has teeth — sampling the AFTER page through the plain P(p) mirrors it',
    (id) => {
      const identity = new Float64Array([1, 0, 0, 0, 1, 0, 0, 0, 1]);
      const v = violations(id, identity, R);
      expect(v.mirror + v.up + v.right).toBeGreaterThan(0);
    },
  );

  it('also holds for a generic improper isometry with a non-trivial θ_align', () => {
    const Rg = genericReflection();
    const ta = alignAngle(Rg);
    expect(ta).toBeCloseTo(TAU - 0.7, 12);
    const Mg = afterDomainTransform(Rg, SPIN_AXIS, ta);
    // violations() closes over the module-level `spin`; recompute it for Rg.
    const save = ta + TAU;
    const proj = PROJECTIONS.mercator;
    const fit = proj.fit(VIEWPORT.w, VIEWPORT.h);
    let bad = 0;
    for (let i = 0; i < 100; i++) {
      const t = -1.2 + i * 0.024;
      const ph = -0.6 + (i % 10) * 0.12;
      const uv = (a: number, b: number): [number, number] => {
        const p = new Float64Array(3);
        spherePoint(a, b, p);
        const q = mul(Mg, p[0]!, p[1]!, p[2]!);
        const o = new Float64Array(2);
        proj.extended(Math.atan2(q[0], q[2]), Math.asin(-q[1]), fit, o);
        return [o[0]!, o[1]!];
      };
      const A = jacobian2(uv, t, ph, 1e-5);
      const B = jacobian2((a, b) => screenOf(Rg, save, a, b), t, ph, 1e-5);
      const ratio =
        (A.dTheta[0] * A.dPhi[1] - A.dPhi[0] * A.dTheta[1]) /
        (B.dTheta[0] * B.dPhi[1] - B.dPhi[0] * B.dTheta[1]);
      if (depthOf(Rg, save, t, ph) > 0.2 && !(ratio > 0)) bad++;
    }
    expect(bad).toBe(0);
  });
});

/* ── S#14 — alignment ─────────────────────────────────────────────────────── */

/** Angle (deg) between the after-page centre's end position and the camera-facing point. */
function centreErrorDeg(R: Mat3, M: Mat3, spin: number): number {
  // The page centre is the surface point p0 with M·p0 = +z, i.e. p0 = Mᵀ·e_z.
  const p0 = [M[6]!, M[7]!, M[8]!] as const;
  const X = ry(spin, mul(R, p0[0], p0[1], p0[2]));
  return angleDeg(X, [0, 0, 1]);
}

describe('S#14 alignment', () => {
  it('alignAngle is 0 for the antipodal map, and in [0, 2π) always', () => {
    expect(alignAngle(R_ANTIPODE)).toBe(0);
    const Rg = genericReflection();
    const a = alignAngle(Rg);
    expect(a).toBeGreaterThanOrEqual(0);
    expect(a).toBeLessThan(TAU);
  });

  it('the after-page centre faces the camera within 0.1° at θ_end = θ_align + 2πk', () => {
    for (const R of [fitEndIsometry(ORACLE.F).R, genericReflection()]) {
      const ta = alignAngle(R);
      const M = afterDomainTransform(R, SPIN_AXIS, ta);
      for (const k of [-1, 0, 1, 2]) {
        expect(centreErrorDeg(R, M, ta + k * TAU)).toBeLessThan(0.1);
      }
    }
  });

  it('afterDomainTransform writes into `out` and is column-major', () => {
    const out = new Float64Array(9);
    const M = afterDomainTransform(R_ANTIPODE, SPIN_AXIS, Math.PI / 2, out);
    expect(M).toBe(out);
    // M = Ry(π/2)·(−I): Ry(π/2) columns (0,0,−1),(0,1,0),(1,0,0); negated.
    const want = [0, 0, 1, 0, -1, 0, -1, 0, 0];
    for (let i = 0; i < 9; i++) expect(M[i]).toBeCloseTo(want[i]!, 12);
  });

  describe('integration with the real Timeline', () => {
    function run(R: Mat3) {
      const thetaAlign = alignAngle(R);
      const M = afterDomainTransform(R, SPIN_AXIS, thetaAlign);
      const tl = new Timeline({
        viewport: { w: 1280, h: 720, dpr: 1 },
        globe: { yaw: 40, pitch: 10, yawVel: 25, pitchVel: 0, centre: [640, 360], radius: 150 },
        orb: { cx: 60, cy: 660, radius: 24 },
        thetaAlign,
      });
      const t0 = 1000;
      let now = t0;
      tl.start(t0);
      tl.afterReady(now + 10);
      let atUnwrap: TimelineSnapshot | null = null;
      let target = NaN;
      let landed: TimelineSnapshot | null = null;
      for (let i = 0; i < 1000 && !landed; i++) {
        now += 10;
        const snap = tl.tick(now);
        for (const ev of tl.events()) {
          if (ev.stage === 'unwrap') {
            atUnwrap = { ...snap };
            target = tl.spinTarget;
          }
        }
        if (snap.t >= 4300) landed = { ...snap };
      }
      return { R, M, thetaAlign, atUnwrap: atUnwrap!, target, landed: landed! };
    }

    for (const [name, R] of [
      ['antipodal R (θ_align = 0)', R_ANTIPODE],
      ['generic R (θ_align = 2π − 0.7)', genericReflection()],
    ] as const) {
      it(`${name}: the spin is committed to θ_align at UNWRAP and lands within 0.1°`, () => {
        const r = run(R);
        expect(r.atUnwrap).not.toBeNull();
        // At the unwrap event the spin's landing angle is θ_align + 2πk exactly…
        const k = Math.round((r.target - r.thetaAlign) / TAU);
        expect(r.target).toBeCloseTo(r.thetaAlign + k * TAU, 9);
        // …so the page centre the committed landing implies is within 0.1° of the camera.
        expect(centreErrorDeg(R, r.M, r.target)).toBeLessThan(0.1);
        // And the spin the renderer actually draws at 4300 ms IS that landing.
        expect(centreErrorDeg(R, r.M, r.landed.spin)).toBeLessThan(0.1);
        // The remaining travel at the unwrap event is never backwards (spec §7.4).
        expect(r.target - r.atUnwrap.spin).toBeGreaterThanOrEqual(-1e-9);
        console.warn(
          `[orientation.test] ${name}: spin ${(r.atUnwrap.spin / DEG).toFixed(2)}° at unwrap, ` +
            `target ${(r.target / DEG).toFixed(2)}°, residual at the event ` +
            `${centreErrorDeg(R, r.M, r.atUnwrap.spin).toFixed(2)}°`,
        );
      });
    }
  });
});

// The axis is a parameter, not a constant: the default is SPIN_AXIS but any axis works.
describe('alignAngle about a non-default axis', () => {
  it('rotates R·c onto the camera azimuth about any axis', () => {
    const axis: Vec3 = [0, 1, 0];
    const R = genericReflection();
    expect(alignAngle(R, axis)).toBeCloseTo(alignAngle(R), 12);
    // About the viewer axis there is no azimuth to fix for R·c ∥ z: returns 0.
    expect(alignAngle(R_ANTIPODE, [0, 0, 1])).toBe(0);
  });
});
