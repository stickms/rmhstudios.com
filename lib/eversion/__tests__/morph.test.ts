import { describe, expect, it } from 'vitest';

import { GLOBE_RADIUS_FRACTION } from '../constants';
import { spherePoint } from '../domain';
import { cameraFor, flatPosition, morphPosition, projectToViewport, wrapWeight } from '../morph';
import type { EquirectFit, FitParams, Projection, Viewport } from '../types';

/*
 * Morph tests — spec §11.1 tests 15 and 16.
 *
 * The tests are written against the `Projection` contract, not a particular
 * projection. `MORPH_TEST_PROJECTIONS` is the hook: it lists what the suite runs
 * over. Today it holds a local equirectangular double (the real projections are
 * implemented by other tasks); the orchestrator swaps in
 * `Object.values(PROJECTIONS)` from '../projections' once they land.
 */

/** Equirectangular, honouring the contract (spec §5.3: width ↔ 360° if A ≤ ½, else height ↔ 180°). */
const equirectDouble: Projection = {
  id: 'equirect',
  fit(w, h) {
    const A = h / w;
    const wide = A <= 0.5;
    const fit: EquirectFit = {
      kind: 'equirect',
      aspect: A,
      policy: wide ? 'width' : 'height',
      lonHalf: wide ? Math.PI : Math.PI / (2 * A),
      phiMax: wide ? Math.PI * A : Math.PI / 2,
      halfW: wide ? Math.PI : Math.PI / (2 * A),
      halfH: wide ? Math.PI * A : Math.PI / 2,
    };
    return fit;
  },
  forward(theta, phi, fit, out, offset = 0) {
    this.extended(theta, phi, fit, out, offset);
    const u = out[offset]!;
    const v = out[offset + 1]!;
    return u >= 0 && u <= 1 && v >= 0 && v <= 1;
  },
  extended(theta, phi, fit, out, offset = 0) {
    const f = fit as EquirectFit;
    const t = Math.atan2(Math.sin(theta), Math.cos(theta)); // wrap to (−π, π]
    out[offset] = Math.min(Math.max(0.5 + t / (2 * f.halfW), -4), 5);
    out[offset + 1] = Math.min(Math.max(0.5 - phi / (2 * f.halfH), -4), 5);
  },
  inverse(u, v, fit, out, offset = 0) {
    const f = fit as EquirectFit;
    out[offset] = (u - 0.5) * 2 * f.halfW;
    out[offset + 1] = -(v - 0.5) * 2 * f.halfH;
    return true;
  },
  singular: () => false,
};

/** The projections the suite runs over; swap for `Object.values(PROJECTIONS)` when T04–T06 land. */
export const MORPH_TEST_PROJECTIONS: readonly Projection[] = [equirectDouble];

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
  proj.extended(theta, phi, fit, uv);
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
          speeds.push((Math.hypot(b[0]! - a[0]!, b[1]! - a[1]!) * STEPS) / travel);
        }
      }
      // Frames where a vertex has not started (or has finished) are not "moving".
      const moving = speeds.filter((x) => x > 1e-6).sort((x, y) => x - y);
      const median = moving[moving.length >> 1]!;
      const max = moving[moving.length - 1]!;
      expect(max / median).toBeLessThanOrEqual(3);
    });
  });
});
