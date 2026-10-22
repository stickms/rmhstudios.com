/**
 * Projection unit tests S#1–S#4 (spec §11.1) for the four projections of T04
 * (Mercator, equirectangular) and T05 (stereographic, Lambert).
 *
 * One `describe` per projection; the Peirce suite lives in
 * `projections-peirce.test.ts` so the two never collide.
 *
 * Every property is asserted ONCE per (projection, aspect): the scan returns
 * its first counter-example as text and the `expect` compares it to `null`, so
 * a failure names the offending sample instead of failing a hot loop.
 */

import { describe, expect, it } from 'vitest';
import { globeK } from '../../globe';
import { GLOBE_RADIUS_FRACTION, LUT_UV_EXTENT } from '../constants';
import { PHI_MAX, PHI_MIN, THETA_MAX, THETA_MIN, wrapTheta } from '../domain';
import { getProjection } from '../projections';
import type { EquirectFit, FitParams, LambertFit, MercatorFit, Projection } from '../types';
import {
  ASPECTS,
  coveredFraction,
  forEachCell,
  jacobian,
  roundTrip,
  sphereDistance,
  stereographicAnalyticFraction,
} from './projections-helpers';

const mercator = getProjection('mercator');
const equirect = getProjection('equirect');
const stereographic = getProjection('stereographic');
const lambert = getProjection('lambert');

const COLS = 512;
const ROWS = 256;

/* ── Shared properties ────────────────────────────────────────────────────── */

/** S#1 — inverse(forward(p)) = p to 1e-9 on the 512 × 256 grid, off the singular set. */
function roundTripSuite(proj: Projection): void {
  describe('S#1 round trip', () => {
    it.each(ASPECTS)('inverse(forward(p)) = p at $name', ({ w, h }) => {
      const fit = proj.fit(w, h);
      const r = roundTrip(proj, fit, COLS, ROWS, 1e-9);
      expect(r.first).toBeNull();
      // A vacuous pass (nothing covered) would hide a broken forward().
      expect(r.checked).toBeGreaterThan(1000);
    });
  });
}

/** The page centre is the front point, in both directions (S#4). */
function centreSuite(proj: Projection): void {
  it.each(ASPECTS)('the page centre maps to the front point at $name', ({ w, h }) => {
    const fit = proj.fit(w, h);
    const uv = new Float64Array(2);
    expect(proj.forward(0, 0, fit, uv)).toBe(true);
    expect(Math.abs(uv[0]! - 0.5) + Math.abs(uv[1]! - 0.5)).toBeLessThan(1e-12);
    const tp = new Float64Array(2);
    expect(proj.inverse(0.5, 0.5, fit, tp)).toBe(true);
    expect(Math.abs(tp[0]!) + Math.abs(tp[1]!)).toBeLessThan(1e-12);
  });
}

/**
 * `extended()` contract (types.ts): equals `forward` where the page covers,
 * lies outside `[0,1]²` exactly where `forward` says glass, and is finite and
 * within `±LUT_UV_EXTENT` everywhere — including the poles, the seam and the
 * back pole.
 */
function extendedSuite(proj: Projection): void {
  describe('extended()', () => {
    it.each(ASPECTS)('agrees with forward and is the glass test at $name', ({ w, h }) => {
      const fit = proj.fit(w, h);
      const uv = new Float64Array(2);
      const ex = new Float64Array(2);
      let first: string | null = null;
      forEachCell(COLS / 2, ROWS / 2, (theta, phi) => {
        if (first !== null) return;
        const covered = proj.forward(theta, phi, fit, uv);
        proj.extended(theta, phi, fit, ex);
        const inside = ex[0]! >= 0 && ex[0]! <= 1 && ex[1]! >= 0 && ex[1]! <= 1;
        if (inside !== covered) first = `θ=${theta} φ=${phi}: covered=${covered} ex=${ex}`;
        else if (covered && (ex[0] !== uv[0] || ex[1] !== uv[1]))
          first = `θ=${theta} φ=${phi}: extended ${ex} ≠ forward ${uv}`;
      });
      expect(first).toBeNull();
    });

    it.each(ASPECTS)('is finite and bounded at every special point, at $name', ({ w, h }) => {
      const fit = proj.fit(w, h);
      const ex = new Float64Array(2);
      const specials: Array<[number, number]> = [];
      for (const theta of [THETA_MIN, -Math.PI / 2, 0, 1e-300, Math.PI / 2, THETA_MAX, 7, -123.4]) {
        for (const phi of [PHI_MIN, -1e-12 + PHI_MIN, -0.5, 0, 0.5, PHI_MAX - 1e-12, PHI_MAX]) {
          specials.push([theta, phi]);
        }
      }
      let first: string | null = null;
      for (const [theta, phi] of specials) {
        proj.extended(theta, phi, fit, ex);
        const ok =
          Number.isFinite(ex[0]!) &&
          Number.isFinite(ex[1]!) &&
          Math.abs(ex[0]! - 0.5) <= 0.5 + LUT_UV_EXTENT &&
          Math.abs(ex[1]! - 0.5) <= 0.5 + LUT_UV_EXTENT;
        if (!ok && first === null) first = `θ=${theta} φ=${phi} → ${ex}`;
      }
      expect(first).toBeNull();
    });

    it.each(ASPECTS)('is continuous across the page edge at $name', ({ w, h }) => {
      // A smooth continuation: walking a parallel through the edge never jumps.
      const fit = proj.fit(w, h);
      const a = new Float64Array(2);
      const b = new Float64Array(2);
      const steps = 6000;
      let worst = 0;
      for (const phi of [0.3, -0.7, 0]) {
        proj.extended(0, phi, fit, a);
        for (let i = 1; i <= steps; i++) {
          const theta = (i / steps) * 2.5;
          proj.extended(theta, phi, fit, b);
          worst = Math.max(worst, Math.abs(b[0]! - a[0]!) + Math.abs(b[1]! - a[1]!));
          a[0] = b[0]!;
          a[1] = b[1]!;
        }
      }
      // Step is 4.2e-4 rad; the steepest UV slope on any of these is < 10.
      expect(worst).toBeLessThan(0.01);
    });
  });
}

/** Both the forward and the inverse refuse nothing they should accept, and refuse the rest. */
function domainSuite(proj: Projection): void {
  it('inverse refuses UV outside the page; forward accepts any θ by wrapping', () => {
    const fit = proj.fit(1600, 900);
    const tp = new Float64Array([42, 42]);
    for (const [u, v] of [
      [-0.001, 0.5],
      [1.001, 0.5],
      [0.5, -0.001],
      [0.5, 1.001],
      [Number.NaN, 0.5],
    ] as const) {
      expect(proj.inverse(u, v, fit, tp)).toBe(false);
    }
    expect(tp[0]).toBe(42); // "writes nothing" on refusal
    const a = new Float64Array(2);
    const b = new Float64Array(2);
    expect(proj.forward(0.4, 0.2, fit, a)).toBe(proj.forward(0.4 + 6 * Math.PI, 0.2, fit, b));
    expect(Math.abs(a[0]! - b[0]!) + Math.abs(a[1]! - b[1]!)).toBeLessThan(1e-9);
  });

  it('fit is pure and writes at the offset it is given', () => {
    expect(proj.fit(1234, 567)).toEqual(proj.fit(1234, 567));
    const fit = proj.fit(1600, 900);
    const out = new Float64Array(5).fill(-9);
    expect(proj.forward(0, 0, fit, out, 3)).toBe(true);
    expect([out[0], out[1], out[2]]).toEqual([-9, -9, -9]);
    expect(out[3]).toBeCloseTo(0.5, 12);
    proj.extended(0, 0, fit, out, 1);
    expect(out[1]).toBeCloseTo(0.5, 12);
    proj.inverse(0.5, 0.5, fit, out, 2);
    expect(Math.abs(out[2]!) + Math.abs(out[3]!)).toBeLessThan(1e-12);
  });
}

/** S#2 — conformal: the cos φ-scaled Jacobian is a scaled rotation. */
function conformalSuite(proj: Projection): void {
  describe('S#2 conformality', () => {
    it.each(ASPECTS)('J is a scaled rotation over the page at $name', ({ w, h }) => {
      const fit = proj.fit(w, h);
      const uv = new Float64Array(2);
      let checked = 0;
      let first: string | null = null;
      forEachCell(COLS, ROWS, (theta, phi) => {
        if (first !== null || proj.singular(theta, phi, fit)) return;
        if (!proj.forward(theta, phi, fit, uv)) return;
        const { j11, j12, j21, j22 } = jacobian(proj, fit, theta, phi);
        const norm = Math.hypot(j11, j12, j21, j22);
        const defect = Math.abs(j11 - j22) + Math.abs(j12 + j21);
        checked++;
        if (!(defect <= 1e-6 * norm)) first = `θ=${theta} φ=${phi}: defect ${defect} / ‖J‖ ${norm}`;
      });
      expect(first).toBeNull();
      expect(checked).toBeGreaterThan(1000);
    });
  });
}

/* ── Mercator ─────────────────────────────────────────────────────────────── */

describe('mercator', () => {
  roundTripSuite(mercator);
  conformalSuite(mercator);
  extendedSuite(mercator);
  domainSuite(mercator);

  describe('S#4 fit invariants', () => {
    centreSuite(mercator);

    it.each(ASPECTS)('is true scale: one page px per screen px at the front point, at $name', ({ w, h }) => {
      const fit = mercator.fit(w, h) as MercatorFit;
      const screenPerRad = GLOBE_RADIUS_FRACTION * Math.min(w, h) * globeK(1);
      const pagePerRad = w / (2 * fit.halfW);
      if (fit.halfW < Math.PI) expect(pagePerRad / screenPerRad).toBeCloseTo(1, 12);
      else expect(pagePerRad).toBeLessThan(screenPerRad); // a page too wide for the globe closes the gore instead
      expect(fit.halfH / fit.halfW).toBeCloseTo(h / w, 12);
    });

    it.each(ASPECTS)('φ_max is atan(sinh(halfH)) to 1e-12 at $name', ({ w, h }) => {
      const fit = mercator.fit(w, h) as MercatorFit;
      expect(Math.abs(fit.phiMax - Math.atan(Math.sinh(fit.halfH)))).toBeLessThan(1e-12);
      // …and it is where the page really ends: v = 0 on the north edge.
      const uv = new Float64Array(2);
      expect(mercator.forward(0, fit.phiMax - 1e-9, fit, uv)).toBe(true);
      expect(Math.abs(uv[1]!)).toBeLessThan(1e-6);
      expect(mercator.forward(0, fit.phiMax + 1e-6, fit, uv)).toBe(false);
      expect(mercator.forward(0, -fit.phiMax - 1e-6, fit, uv)).toBe(false);
      // The left and right edges end at ±halfW: the gore behind is glass.
      expect(mercator.forward(fit.halfW - 1e-9, 0, fit, uv)).toBe(true);
      expect(Math.abs(uv[0]! - 1)).toBeLessThan(1e-6);
      if (fit.halfW < Math.PI - 1e-6) expect(mercator.forward(fit.halfW + 1e-6, 0, fit, uv)).toBe(false);
    });

    it.each(ASPECTS)('covers (halfW/π)·sin φ_max of the sphere (±1 %) at $name', ({ w, h }) => {
      const fit = mercator.fit(w, h) as MercatorFit;
      const measured = coveredFraction(mercator, fit);
      const analytic = (fit.halfW / Math.PI) * Math.sin(fit.phiMax);
      expect(Math.abs(measured - analytic) / analytic).toBeLessThan(0.01);
    });
  });

  it('meets its own edges on the back meridian (the seam) when the page is wider than the globe', () => {
    const fit = mercator.fit(4000, 900);
    expect(fit.halfW).toBe(Math.PI);
    const uv = new Float64Array(2);
    const tp = new Float64Array(2);
    mercator.forward(THETA_MAX, 0.2, fit, uv);
    expect(uv[0]).toBe(1);
    mercator.forward(THETA_MIN, 0.2, fit, uv); // −π is the same meridian: wrapped to +π
    expect(uv[0]).toBe(1);
    mercator.inverse(0, 0.5, fit, tp);
    expect(tp[0]).toBeCloseTo(THETA_MIN, 12);
    mercator.inverse(1, 0.5, fit, tp);
    expect(tp[0]).toBeCloseTo(THETA_MAX, 12);
    expect(sphereDistance(THETA_MIN, 0, THETA_MAX, 0)).toBeLessThan(1e-12);
  });

  it('singular() is the glass caps, the back gore and the seam, not the interior', () => {
    const fit = mercator.fit(1600, 900) as MercatorFit;
    expect(mercator.singular(0, 0, fit)).toBe(false);
    expect(mercator.singular(0, fit.phiMax - 0.01, fit)).toBe(false);
    expect(mercator.singular(0, fit.phiMax + 0.01, fit)).toBe(true);
    expect(mercator.singular(0, PHI_MIN, fit)).toBe(true);
    expect(mercator.singular(fit.halfW - 0.01, 0, fit)).toBe(false);
    expect(mercator.singular(fit.halfW + 0.01, 0, fit)).toBe(true);
    expect(mercator.singular(Math.PI, 0, fit)).toBe(true);
    expect(mercator.singular(-Math.PI + 1e-5, 0, fit)).toBe(true);
  });

  it('extended() continues a polar cap straight above the page edge', () => {
    const fit = mercator.fit(1600, 900) as MercatorFit;
    const cap = new Float64Array(2);
    const edge = new Float64Array(2);
    mercator.extended(1.1, 1.4, fit, cap);
    expect(cap[1]).toBeLessThan(0); // above the north edge
    mercator.forward(1.1, fit.phiMax - 1e-12, fit, edge);
    expect(cap[0]).toBeCloseTo(edge[0]!, 12); // same column: clamp = nearest edge pixel
    expect(edge[1]).toBeLessThan(1e-6);
  });
});

/* ── Equirectangular ──────────────────────────────────────────────────────── */

describe('equirect', () => {
  roundTripSuite(equirect);
  extendedSuite(equirect);
  domainSuite(equirect);

  describe('S#4 fit invariants', () => {
    centreSuite(equirect);

    it('switches policy exactly at A = 0.5', () => {
      expect((equirect.fit(1000, 500) as EquirectFit).policy).toBe('width');
      expect((equirect.fit(1000, 499) as EquirectFit).policy).toBe('width');
      expect((equirect.fit(1000, 501) as EquirectFit).policy).toBe('height');
      expect((equirect.fit(2, 1) as EquirectFit).policy).toBe('width');
      // Continuous across the switch: same page half-extents either side.
      const at = equirect.fit(1000, 500) as EquirectFit;
      const above = equirect.fit(1000, 500.000001) as EquirectFit;
      expect(Math.abs(at.lonHalf - above.lonHalf)).toBeLessThan(1e-8);
      expect(Math.abs(at.phiMax - above.phiMax)).toBeLessThan(1e-8);
      expect(at.lonHalf).toBe(Math.PI);
      expect(at.phiMax).toBeCloseTo(Math.PI / 2, 14);
    });

    it.each(ASPECTS)('policy, extents and gore are right at $name', ({ w, h }) => {
      const a = h / w;
      const fit = equirect.fit(w, h) as EquirectFit;
      const uv = new Float64Array(2);
      if (a <= 0.5) {
        expect(fit.policy).toBe('width');
        expect(fit.lonHalf).toBe(Math.PI);
        expect(fit.phiMax).toBeCloseTo(Math.PI * a, 12);
        expect(equirect.forward(Math.PI * 0.999, 0, fit, uv)).toBe(true); // no gore
        expect(equirect.forward(0, fit.phiMax + 1e-6, fit, uv)).toBe(false);
      } else {
        expect(fit.policy).toBe('height');
        expect(fit.phiMax).toBeCloseTo(Math.PI / 2, 14);
        expect(fit.lonHalf).toBeCloseTo(Math.PI / (2 * a), 12);
        expect(equirect.forward(fit.lonHalf - 1e-6, 0, fit, uv)).toBe(true);
        expect(equirect.forward(fit.lonHalf + 1e-6, 0, fit, uv)).toBe(false); // the gore
        expect(equirect.forward(Math.PI, 0, fit, uv)).toBe(false);
        expect(equirect.forward(0, PHI_MAX, fit, uv)).toBe(true); // poles are on the page
      }
    });

    it.each(ASPECTS)('covered fraction matches the analytic value (±1 %) at $name', ({ w, h }) => {
      const a = h / w;
      const fit = equirect.fit(w, h);
      // width: the band |φ| ≤ πA → sin(πA); height: lon fraction π/(2A) of 2π → 1/(2A).
      const analytic = a <= 0.5 ? Math.sin(Math.PI * a) : 1 / (2 * a);
      const measured = coveredFraction(equirect, fit);
      expect(Math.abs(measured - analytic) / analytic).toBeLessThan(0.01);
    });
  });

  it('singular() is the caps (width) or the gore (height), plus the seam', () => {
    const wide = equirect.fit(2100, 900) as EquirectFit;
    expect(equirect.singular(0, 0, wide)).toBe(false);
    expect(equirect.singular(0, wide.phiMax + 0.01, wide)).toBe(true);
    expect(equirect.singular(Math.PI, 0, wide)).toBe(true);
    const tall = equirect.fit(900, 1950) as EquirectFit;
    expect(equirect.singular(tall.lonHalf + 0.01, 0, tall)).toBe(true);
    expect(equirect.singular(tall.lonHalf - 0.01, 0, tall)).toBe(false);
    expect(equirect.singular(0, PHI_MAX, tall)).toBe(true);
  });

  it('extended() continues the back gore sideways, clamping to the page edge', () => {
    const fit = equirect.fit(900, 1950) as EquirectFit;
    const gore = new Float64Array(2);
    const edge = new Float64Array(2);
    equirect.extended(2.5, 0.4, fit, gore);
    expect(gore[0]).toBeGreaterThan(1);
    equirect.forward(fit.lonHalf - 1e-12, 0.4, fit, edge);
    expect(edge[0]).toBeCloseTo(1, 9);
    expect(gore[1]).toBeCloseTo(edge[1]!, 12); // same row
    // Back meridian from the west: u continues below 0.
    equirect.extended(-2.5, 0.4, fit, gore);
    expect(gore[0]).toBeLessThan(0);
  });
});

/* ── Stereographic (back pole) ────────────────────────────────────────────── */

describe('stereographic', () => {
  roundTripSuite(stereographic);
  conformalSuite(stereographic);
  extendedSuite(stereographic);
  domainSuite(stereographic);

  describe('S#4 fit invariants', () => {
    centreSuite(stereographic);

    it.each(ASPECTS)('the half-width subtends 150° from the front at $name', ({ w, h }) => {
      const fit = stereographic.fit(w, h);
      const uv = new Float64Array(2);
      const g = (150 * Math.PI) / 180;
      expect(stereographic.forward(g - 1e-9, 0, fit, uv)).toBe(true);
      expect(uv[0]).toBeCloseTo(1, 7);
      expect(uv[1]).toBeCloseTo(0.5, 12);
      expect(stereographic.forward(g + 1e-6, 0, fit, uv)).toBe(false);
      expect(stereographic.forward(-g + 1e-9, 0, fit, uv)).toBe(true);
      expect(uv[0]).toBeCloseTo(0, 7);
      // Uniform scale: the page is a plain rectangle of aspect A in the plane.
      expect(fit.halfH / fit.halfW).toBeCloseTo(h / w, 12);
    });

    it.each(ASPECTS)('covered fraction matches the analytic value (±1 %) at $name', ({ w, h }) => {
      const fit = stereographic.fit(w, h);
      const analytic = stereographicAnalyticFraction(fit.halfW, fit.halfH);
      const measured = coveredFraction(stereographic, fit);
      expect(Math.abs(measured - analytic) / analytic).toBeLessThan(0.01);
    });
  });

  it('never covers the back pole; singular() is its neighbourhood only', () => {
    const uv = new Float64Array(2);
    for (const { w, h } of ASPECTS) {
      const fit = stereographic.fit(w, h);
      expect(stereographic.forward(Math.PI, 0, fit, uv)).toBe(false);
      expect(stereographic.singular(Math.PI, 0, fit)).toBe(true);
      expect(stereographic.singular(-Math.PI + 5e-4, 0, fit)).toBe(true);
      expect(stereographic.singular(0, 0, fit)).toBe(false);
      expect(stereographic.singular(2, 0.3, fit)).toBe(false);
    }
  });

  it('extended() at the back pole is a finite point past the page', () => {
    const fit = stereographic.fit(1600, 900);
    const ex = new Float64Array(2);
    stereographic.extended(Math.PI, 0, fit, ex);
    expect(Number.isFinite(ex[0]!) && Number.isFinite(ex[1]!)).toBe(true);
    expect(ex[0]! > 1 || ex[0]! < 0 || ex[1]! > 1 || ex[1]! < 0).toBe(true);
  });
});

/* ── Lambert azimuthal equal-area ─────────────────────────────────────────── */

describe('lambert', () => {
  roundTripSuite(lambert);
  extendedSuite(lambert);
  domainSuite(lambert);

  describe('S#3 equal area', () => {
    it.each(ASPECTS)('det J / cos φ is constant (= 1) to 1e-6 at $name', ({ w, h }) => {
      const fit = lambert.fit(w, h);
      let checked = 0;
      let first: string | null = null;
      forEachCell(COLS, ROWS, (theta, phi) => {
        if (first !== null || lambert.singular(theta, phi, fit)) return;
        const { j11, j12, j21, j22 } = jacobian(lambert, fit, theta, phi);
        const det = j11 * j22 - j12 * j21; // θ column already divided by cos φ
        checked++;
        if (!(Math.abs(det - 1) <= 1e-6)) first = `θ=${theta} φ=${phi}: det/cosφ = ${det}`;
      });
      expect(first).toBeNull();
      expect(checked).toBeGreaterThan(10000);
    });
  });

  describe('S#4 fit invariants', () => {
    centreSuite(lambert);

    it.each(ASPECTS)('the page corners sit on the radius-2 circle at $name', ({ w, h }) => {
      const fit = lambert.fit(w, h) as LambertFit;
      expect(fit.circleRadius).toBe(2);
      expect(Math.hypot(fit.halfW, fit.halfH)).toBeCloseTo(2, 12);
      expect(fit.halfH / fit.halfW).toBeCloseTo(h / w, 12);
      // The corner IS the back pole: inverse of each UV corner is θ = ±π, φ = 0.
      const tp = new Float64Array(2);
      for (const [u, v] of [
        [0, 0],
        [1, 0],
        [0, 1],
        [1, 1],
      ] as const) {
        expect(lambert.inverse(u, v, fit, tp)).toBe(true);
        expect(sphereDistance(tp[0]!, tp[1]!, Math.PI, 0)).toBeLessThan(1e-6);
      }
    });

    it.each(ASPECTS)('covered fraction is 4A/(π(1+A²)) (±1 %) at $name', ({ w, h }) => {
      const a = h / w;
      const fit = lambert.fit(w, h);
      const analytic = (4 * a) / (Math.PI * (1 + a * a));
      const measured = coveredFraction(lambert, fit);
      expect(Math.abs(measured - analytic) / analytic).toBeLessThan(0.01);
    });
  });

  it('the lens gaps beyond the page edges are glass', () => {
    const fit = lambert.fit(800, 800); // square: halfW = √2
    const uv = new Float64Array(2);
    const onAxis = (rho: number): number => 2 * Math.asin(rho / 2); // γ with 2 sin(γ/2) = ρ
    expect(lambert.forward(onAxis(1.4), 0, fit, uv)).toBe(true);
    expect(lambert.forward(onAxis(1.43), 0, fit, uv)).toBe(false);
    expect(lambert.forward(onAxis(1.9), 0, fit, uv)).toBe(false);
  });

  it('extended() at the back pole is a finite point on the bounding circle', () => {
    const fit = lambert.fit(1600, 900) as LambertFit;
    const ex = new Float64Array(2);
    lambert.extended(Math.PI, 0, fit, ex);
    const x = (ex[0]! - 0.5) * 2 * fit.halfW;
    const y = (0.5 - ex[1]!) * 2 * fit.halfH;
    expect(Math.hypot(x, y)).toBeCloseTo(2, 9);
  });
});

/* ── The harness itself ───────────────────────────────────────────────────── */

describe('test harness sanity', () => {
  it('the conformality metric flags a non-conformal map (equirect), so S#2 is not vacuous', () => {
    const fit = equirect.fit(1600, 900);
    const { j11, j12, j21, j22 } = jacobian(equirect, fit, 0.3, 1.0);
    const defect = Math.abs(j11 - j22) + Math.abs(j12 + j21);
    expect(defect).toBeGreaterThan(0.1 * Math.hypot(j11, j12, j21, j22));
  });

  it('the equal-area metric flags a non-equal-area map (mercator), so S#3 is not vacuous', () => {
    const fit = mercator.fit(1600, 900);
    const { j11, j12, j21, j22 } = jacobian(mercator, fit, 0.3, 1.0);
    expect(Math.abs(j11 * j22 - j12 * j21 - 1)).toBeGreaterThan(0.1);
  });

  it('wrapTheta/domain constants used by the suites are as expected', () => {
    expect(wrapTheta(-Math.PI)).toBe(Math.PI);
    expect(THETA_MAX - THETA_MIN).toBeCloseTo(2 * Math.PI, 14);
    const fit: FitParams = mercator.fit(1, 1);
    expect(fit.kind).toBe('mercator');
  });
});
