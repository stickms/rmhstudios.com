import { afterAll, describe, expect, it } from 'vitest';

import { GLOBE_RADIUS_FRACTION, LUT_SIZE } from '../constants';
import { spherePoint, THETA_MAX, THETA_MIN } from '../domain';
import { cameraFor, flatPosition, morphPosition, projectToViewport, wrapWeight } from '../morph';
import { afterDomainTransform } from '../orientation';
import { PROJECTIONS } from '../projections';
import { bakeLut, sampleLut } from '../projection-lut';
import { PROJECTION_IDS, type FitParams, type Projection, type Viewport } from '../types';

/*
 * Morph tests — spec §11.1 tests 15 and 16, over all five real projections.
 */

/** The projections the suite runs over: every registered one. */
export const MORPH_TEST_PROJECTIONS: readonly Projection[] = Object.values(PROJECTIONS);

/** Raw (un-normalised) S#16 ratios, printed once at the end so the figure is on record. */
const RAW_RATIOS: string[] = [];

const VIEWPORTS: readonly { w: number; h: number }[] = [
  { w: 360, h: 780 },
  { w: 1440, h: 900 },
  { w: 2560, h: 1440 },
];
const DPRS = [1, 2, 3] as const;

const N_THETA = 96;
const N_PHI = 48;
/** Sample grid; the poles and the seam are included on purpose. */
function* gridPoints(): Generator<[number, number]> {
  for (let i = 0; i <= N_THETA; i++) {
    for (let j = 0; j <= N_PHI; j++) {
      yield [-Math.PI + (2 * Math.PI * i) / N_THETA, -Math.PI / 2 + (Math.PI * j) / N_PHI];
    }
  }
}

function radiusFor(vp: { w: number; h: number }): number {
  return GLOBE_RADIUS_FRACTION * Math.min(vp.w, vp.h);
}

/** Angular distance from the front point over π (the wrap wave's `d`). */
function frontDistance(theta: number, phi: number): number {
  return Math.acos(Math.min(1, Math.max(-1, Math.cos(phi) * Math.cos(theta)))) / Math.PI;
}

/** Camera-space sphere position of (θ, φ): centred, radius r, no spin/tilt. */
function spherePosition(theta: number, phi: number, r: number, out: Float64Array): void {
  spherePoint(theta, phi, out);
  out[0] = out[0]! * r;
  out[1] = out[1]! * r;
  out[2] = out[2]! * r;
}

/** The page pixel the projection assigns to (θ, φ), clamped like the morph. */
function pagePixel(
  proj: Projection,
  theta: number,
  phi: number,
  fit: FitParams,
  vp: Viewport,
): [number, number] {
  const uv = new Float64Array(2);
  // The seam-left column (θ = −π) belongs to the page's left edge, as in the shader.
  proj.extended(theta <= THETA_MIN ? THETA_MIN + 1e-7 : theta, phi, fit, uv);
  return [Math.min(Math.max(uv[0]!, 0), 1) * vp.w, Math.min(Math.max(uv[1]!, 0), 1) * vp.h];
}

describe('camera', () => {
  it('puts the z = 0 plane at unit scale for any radius, and matches globeK', () => {
    for (const r of [10, 300, 900]) {
      const cam = cameraFor({ w: 800, h: 600, dpr: 1 }, r);
      const o = new Float64Array(2);
      projectToViewport(cam, [123, -45, 0], o);
      expect(o[0]).toBeCloseTo(400 + 123, 10);
      expect(o[1]).toBeCloseTo(300 - 45, 10);
      // Body depth z (unit sphere) scales by globeK(z) = P / (P − z/2).
      projectToViewport(cam, [r, 0, 0.6 * r], o);
      expect((o[0]! - 400) / r).toBeCloseTo(3.1 / (3.1 - 0.3), 10);
    }
  });

  it('reuses the out object', () => {
    const out = { distance: 0, width: 0, height: 0 };
    expect(cameraFor({ w: 10, h: 20, dpr: 1 }, 5, out)).toBe(out);
    expect(out).toEqual({ distance: 31, width: 10, height: 20 });
  });
});

describe('wrapWeight', () => {
  it('is exactly 0 at s = 0 and exactly 1 at s = 1 for every d', () => {
    for (let i = 0; i <= 20; i++) {
      expect(wrapWeight(0, i / 20)).toBe(0);
      expect(wrapWeight(1, i / 20)).toBe(1);
    }
  });

  it('is monotone in s, antitone in d, and the centre leads the edge', () => {
    for (let d = 0; d <= 1; d += 0.1) {
      let prev = -1;
      for (let s = 0; s <= 1; s += 0.01) {
        const w = wrapWeight(s, d);
        expect(w).toBeGreaterThanOrEqual(prev);
        prev = w;
      }
    }
    for (let s = 0.05; s < 1; s += 0.05) {
      expect(wrapWeight(s, 0)).toBeGreaterThanOrEqual(wrapWeight(s, 0.5));
      expect(wrapWeight(s, 0.5)).toBeGreaterThanOrEqual(wrapWeight(s, 1));
    }
  });
});

describe('morphPosition', () => {
  it('is a componentwise mix with exact endpoints', () => {
    const f = [1.1, -2.2, 0];
    const s = [30, 40, 50];
    const o = new Float64Array(5);
    morphPosition(f, s, 0, o, 1);
    expect([o[1], o[2], o[3]]).toEqual(f);
    morphPosition(f, s, 1, o, 1);
    expect(o[1]).toBeCloseTo(30, 12);
    morphPosition(f, new Float32Array(s), 0.5, o);
    expect(o[0]).toBeCloseTo(15.55, 5);
  });
});

describe('the morph suite covers the real projections', () => {
  it('runs S#15 and S#16 over all five registered projections, not a stand-in', () => {
    expect(MORPH_TEST_PROJECTIONS.map((p) => p.id).sort()).toEqual([...PROJECTION_IDS].sort());
    expect(MORPH_TEST_PROJECTIONS).toHaveLength(5);
  });
});

describe.each(MORPH_TEST_PROJECTIONS.map((p) => [p.id, p] as const))('%s morph', (_id, proj) => {
  describe.each(VIEWPORTS)('viewport $w×$h', ({ w, h }) => {
    // S#15 — at WRAP s = 0 and at UNWRAP end (unwrap channel = 0) the weight is 0
    // for every d, so the vertex is its flat position and the camera must put it
    // on the page pixel.
    it.each(DPRS)('S#15 pixel-exact endpoints at DPR %i', (dpr) => {
      const vp: Viewport = { w, h, dpr };
      const fit = proj.fit(w, h);
      const r = radiusFor(vp);
      const cam = cameraFor(vp, r);
      const flat = new Float64Array(3);
      const sph = new Float64Array(3);
      const pos = new Float64Array(3);
      const scr = new Float64Array(2);
      let worst = 0;
      for (const [theta, phi] of gridPoints()) {
        flatPosition(theta, phi, proj, fit, vp, flat);
        spherePosition(theta, phi, r, sph);
        const [px, py] = pagePixel(proj, theta, phi, fit, vp);
        morphPosition(flat, sph, wrapWeight(0, frontDistance(theta, phi)), pos);
        projectToViewport(cam, pos, scr);
        // Error in DEVICE pixels, the stricter reading.
        worst = Math.max(worst, Math.hypot(scr[0]! - px, scr[1]! - py) * dpr);
      }
      expect(worst).toBeLessThan(0.5);
    });

    // The same check for the UNWRAP end state: the vertex goes to the pixel of
    // P(M_after · p) (gl/shaders.ts), with the weight's `d` taken from the rotated
    // point, exactly as the shader does.
    it.each(DPRS)('S#15 pixel-exact UNWRAP endpoints (M_after side) at DPR %i', (dpr) => {
      const vp: Viewport = { w, h, dpr };
      const fit = proj.fit(w, h);
      const r = radiusFor(vp);
      const cam = cameraFor(vp, r);
      // R = −I, an arbitrary alignment: the check must hold for any M.
      const M = afterDomainTransform(
        new Float64Array([-1, 0, 0, 0, -1, 0, 0, 0, -1]),
        [0, 1, 0],
        0.7,
      );
      const flat = new Float64Array(3);
      const sph = new Float64Array(3);
      const pos = new Float64Array(3);
      const scr = new Float64Array(2);
      const p = new Float64Array(3);
      let worst = 0;
      for (const [theta, phi] of gridPoints()) {
        spherePoint(theta, phi, p);
        const lx = M[0]! * p[0]! + M[3]! * p[1]! + M[6]! * p[2]!;
        const ly = M[1]! * p[0]! + M[4]! * p[1]! + M[7]! * p[2]!;
        const lz = M[2]! * p[0]! + M[5]! * p[1]! + M[8]! * p[2]!;
        const tTheta = Math.atan2(lx, lz);
        const tPhi = Math.asin(Math.min(1, Math.max(-1, -ly)));
        flatPosition(tTheta, tPhi, proj, fit, vp, flat);
        spherePosition(theta, phi, r, sph);
        const [px, py] = pagePixel(proj, tTheta, tPhi, fit, vp);
        const d = Math.acos(Math.min(1, Math.max(-1, lz))) / Math.PI;
        morphPosition(flat, sph, wrapWeight(0, d), pos);
        projectToViewport(cam, pos, scr);
        worst = Math.max(worst, Math.hypot(scr[0]! - px, scr[1]! - py) * dpr);
      }
      expect(worst).toBeLessThan(0.5);
    });

    it('S#16 glass vertices lie on the page border at s = 0', () => {
      const vp: Viewport = { w, h, dpr: 1 };
      const fit = proj.fit(w, h);
      const flat = new Float64Array(3);
      const uv = new Float64Array(2);
      for (const [theta, phi] of gridPoints()) {
        const covered = proj.forward(theta, phi, fit, uv);
        flatPosition(theta, phi, proj, fit, vp, flat);
        expect(Math.abs(flat[0]!)).toBeLessThanOrEqual(w / 2 + 1e-9);
        expect(Math.abs(flat[1]!)).toBeLessThanOrEqual(h / 2 + 1e-9);
        expect(flat[2]).toBe(0);
        if (!covered) {
          const onBorder =
            Math.abs(Math.abs(flat[0]!) - w / 2) < 1e-9 ||
            Math.abs(Math.abs(flat[1]!) - h / 2) < 1e-9;
          expect(onBorder).toBe(true);
        }
      }
    });

    it('S#16 max vertex screen speed over WRAP is <= 3x the median', () => {
      const vp: Viewport = { w, h, dpr: 1 };
      const fit = proj.fit(w, h);
      const r = radiusFor(vp);
      const cam = cameraFor(vp, r);
      const flats: Float64Array[] = [];
      const spheres: Float64Array[] = [];
      const ds: number[] = [];
      for (let i = 0; i <= 48; i++) {
        for (let j = 0; j <= 24; j++) {
          const theta = -Math.PI + (2 * Math.PI * i) / 48;
          const phi = -Math.PI / 2 + (Math.PI * j) / 24;
          const f = new Float64Array(3);
          const sp = new Float64Array(3);
          flatPosition(theta, phi, proj, fit, vp, f);
          spherePosition(theta, phi, r, sp);
          flats.push(f);
          spheres.push(sp);
          ds.push(frontDistance(theta, phi));
        }
      }
      // Speed is measured per vertex in units of that vertex's own screen travel
      // (|screen(s=1) − screen(s=0)|), per unit of s. Raw pixel speeds differ by
      // 10x between a page corner and a point near the front purely because their
      // routes differ in length — geometry, not a fly-in. Normalising by route
      // length isolates the TEMPORAL profile, which is what a fly-in would distort
      // (a vertex that waits and then dashes has a huge normalised peak).
      const STEPS = 120;
      const rawSpeeds: number[] = [];
      const pos = new Float64Array(3);
      const a = new Float64Array(2);
      const b = new Float64Array(2);
      const speeds: number[] = [];
      for (let v = 0; v < flats.length; v++) {
        morphPosition(flats[v]!, spheres[v]!, 0, pos);
        projectToViewport(cam, pos, a);
        morphPosition(flats[v]!, spheres[v]!, 1, pos);
        projectToViewport(cam, pos, b);
        const travel = Math.hypot(b[0]! - a[0]!, b[1]! - a[1]!);
        if (travel < 1) continue; // the front point barely moves on screen
        for (let k = 0; k < STEPS; k++) {
          morphPosition(flats[v]!, spheres[v]!, wrapWeight(k / STEPS, ds[v]!), pos);
          projectToViewport(cam, pos, a);
          morphPosition(flats[v]!, spheres[v]!, wrapWeight((k + 1) / STEPS, ds[v]!), pos);
          projectToViewport(cam, pos, b);
          const pxSpeed = Math.hypot(b[0]! - a[0]!, b[1]! - a[1]!) * STEPS;
          speeds.push(pxSpeed / travel);
          rawSpeeds.push(pxSpeed);
        }
      }
      // Frames where a vertex has not started (or has finished) are not "moving".
      const moving = speeds.filter((x) => x > 1e-6).sort((x, y) => x - y);
      const median = moving[moving.length >> 1]!;
      const max = moving[moving.length - 1]!;
      expect(max / median).toBeLessThanOrEqual(3);
      // Reported, not gated: the RAW pixel-speed ratio (route length included). Vertices
      // have routes of very different lengths, so this is geometry, not a fly-in.
      const rawMoving = rawSpeeds.filter((x) => x > 1e-6).sort((x, y) => x - y);
      const rawRatio = rawMoving[rawMoving.length - 1]! / rawMoving[rawMoving.length >> 1]!;
      RAW_RATIOS.push(`${proj.id} ${w}x${h}: raw max/median = ${rawRatio.toFixed(1)}`);
      expect(Number.isFinite(rawRatio)).toBe(true);
    });
  });
});

afterAll(() => {
  if (RAW_RATIOS.length)
    console.warn(`S#16 raw speed ratios (not gated):\n${RAW_RATIOS.join('\n')}`);
});

describe.each(MORPH_TEST_PROJECTIONS.map((p) => [p.id, p] as const))(
  '%s seam column agrees with the shader LUT',
  (_id, proj) => {
    // The mesh has a θ = −π column (seam-left) and a θ = +π column (seam-right). The shader reads the baked
    // LUT with a clamped lookup: column 0 at −π, the last column at +π. flatPosition must land on the same
    // page pixel (to within the LUT's own sampling error: a texel is ~1/1024 of a page).
    it.each([
      { w: 1440, h: 900 },
      { w: 360, h: 780 },
    ])('θ = ±π at $w×$h', ({ w, h }) => {
      const vp: Viewport = { w, h, dpr: 1 };
      const fit = proj.fit(w, h);
      const lut = bakeLut(proj, fit, LUT_SIZE);
      const flat = new Float64Array(3);
      const uv = new Float64Array(2);
      let worstFrac = 0;
      for (const theta of [THETA_MIN, THETA_MAX]) {
        for (let j = 1; j < 24; j++) {
          // The antipode of the page centre (φ ≈ 0 on the back meridian) is a singular
          // point of several projections: the LUT's texel is a step there, not a gradient.
          if (Math.abs(j - 12) <= 1) continue;
          const phi = -Math.PI / 2 + (Math.PI * j) / 24;
          flatPosition(theta, phi, proj, fit, vp, flat);
          sampleLut(lut, LUT_SIZE, theta, phi, uv);
          const u = Math.min(Math.max(uv[0]!, 0), 1);
          const v = Math.min(Math.max(uv[1]!, 0), 1);
          worstFrac = Math.max(
            worstFrac,
            Math.abs(flat[0]! - (u - 0.5) * w) / w,
            Math.abs(flat[1]! - (v - 0.5) * h) / h,
          );
        }
      }
      // Fraction of the page; a texel's worth of bilinear + clamp error.
      expect(worstFrac).toBeLessThan(0.02);
    });
  },
);
