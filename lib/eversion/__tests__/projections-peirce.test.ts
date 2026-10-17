import { describe, expect, it } from 'vitest';

import { LUT_UV_EXTENT } from '../constants';
import { PHI_MAX, PHI_MIN, THETA_MAX, THETA_MIN } from '../domain';
import { K_HALF, cnComplexHalf, jacobiHalf, lemniscateIntegral } from '../projections/elliptic';
import { PEIRCE_SQUARE_HALF, peirce } from '../projections/peirce';
import type { PeirceFit } from '../types';
import { analyticCoverage, chord, planeAt } from './peirce-helpers';

/** Viewports of S#4, as `[w, h]`. */
const ASPECTS: ReadonlyArray<readonly [string, number, number]> = [
  ['9:19.5', 9, 19.5],
  ['3:4', 3, 4],
  ['1:1', 1, 1],
  ['16:10', 16, 10],
  ['16:9', 16, 9],
  ['21:9', 21, 9],
];

/** Printed numbers (benchmark, accuracy) — stdout, via console.warn, the one console method the lint rule allows. */
const report = (line: string) => console.warn(line);

const fitOf = (w: number, h: number) => peirce.fit(w, h) as PeirceFit;

/** Cell-centred grid over the chart, `nT × nP`. */
function* grid(nT: number, nP: number): Generator<[number, number]> {
  for (let j = 0; j < nP; j++) {
    const phi = PHI_MIN + ((j + 0.5) / nP) * (PHI_MAX - PHI_MIN);
    for (let i = 0; i < nT; i++) {
      yield [THETA_MIN + ((i + 0.5) / nT) * (THETA_MAX - THETA_MIN), phi];
    }
  }
}

describe('peirce — elliptic building blocks', () => {
  it('real Jacobi functions at k² = ½ satisfy their identities and the quarter-period values', () => {
    const o = new Float64Array(3);
    for (let i = -40; i <= 80; i++) {
      const u = (i / 40) * K_HALF;
      jacobiHalf(u, o);
      expect(o[0]! ** 2 + o[1]! ** 2).toBeCloseTo(1, 13);
      expect(o[2]! ** 2 + 0.5 * o[0]! ** 2).toBeCloseTo(1, 13);
    }
    jacobiHalf(K_HALF, o);
    expect(o[0]).toBeCloseTo(1, 14);
    expect(Math.abs(o[1]!)).toBeLessThan(1e-14);
    // d(sn)/du = cn·dn
    jacobiHalf(0.7 + 1e-6, o);
    const s1 = o[0]!;
    jacobiHalf(0.7 - 1e-6, o);
    const s0 = o[0]!;
    jacobiHalf(0.7, o);
    expect((s1 - s0) / 2e-6).toBeCloseTo(o[1]! * o[2]!, 8);
  });

  it('K(1/√2) matches the lemniscatic integral: w(1) = K/√2 and cn(K − √2·w) = ζ', () => {
    const w = new Float64Array(2);
    lemniscateIntegral(1, 0, w);
    expect(w[0]).toBeCloseTo(PEIRCE_SQUARE_HALF, 14);
    lemniscateIntegral(0, 1, w);
    expect(w[1]).toBeCloseTo(PEIRCE_SQUARE_HALF, 14);
    const z = new Float64Array(2);
    for (const [zr, zi] of [
      [0.3, 0.2],
      [-0.6, 0.5],
      [0.1, -0.9],
      [0.7, 0.7],
    ] as const) {
      lemniscateIntegral(zr, zi, w);
      cnComplexHalf(K_HALF - Math.SQRT2 * w[0]!, -Math.SQRT2 * w[1]!, z);
      expect(z[0]).toBeCloseTo(zr, 13);
      expect(z[1]).toBeCloseTo(zi, 13);
    }
  });
});

describe('peirce — S#1 round trip', () => {
  it('inverse(forward(p)) = p to 1e-9 over a 512×256 grid, away from the cut (1:1, page = whole square)', () => {
    const fit = fitOf(1, 1);
    const uv = new Float64Array(2);
    const back = new Float64Array(2);
    let worst = 0;
    let checked = 0;
    for (const [t, p] of grid(512, 256)) {
      if (peirce.singular(t, p, fit)) continue;
      expect(peirce.forward(t, p, fit, uv)).toBe(true);
      expect(peirce.inverse(uv[0]!, uv[1]!, fit, back)).toBe(true);
      worst = Math.max(worst, chord(t, p, back[0]!, back[1]!));
      checked++;
    }
    expect(checked).toBeGreaterThan(130_000);
    expect(worst).toBeLessThan(1e-9);
    report(`peirce round-trip: worst chord error ${worst.toExponential(2)} over ${checked} points`);
  });

  it('holds at 16:9 on every point the page covers, and the glass has no page preimage', () => {
    const fit = fitOf(16, 9);
    const uv = new Float64Array(2);
    const back = new Float64Array(2);
    let covered = 0;
    for (const [t, p] of grid(256, 128)) {
      if (peirce.singular(t, p, fit)) continue;
      if (peirce.forward(t, p, fit, uv)) {
        covered++;
        expect(peirce.inverse(uv[0]!, uv[1]!, fit, back)).toBe(true);
        expect(chord(t, p, back[0]!, back[1]!)).toBeLessThan(1e-9);
      } else {
        peirce.extended(t, p, fit, uv);
        expect(uv[0]! < 0 || uv[0]! > 1 || uv[1]! < 0 || uv[1]! > 1).toBe(true);
        expect(peirce.inverse(uv[0]!, uv[1]!, fit, back)).toBe(false);
      }
    }
    expect(covered).toBeGreaterThan(0);
  });

  it('keeps the inverse in range: θ ∈ [−π, π], φ ∈ [−π/2, π/2] on a UV grid', () => {
    const fit = fitOf(3, 4);
    const out = new Float64Array(2);
    for (let i = 0; i <= 64; i++) {
      for (let j = 0; j <= 64; j++) {
        expect(peirce.inverse(i / 64, j / 64, fit, out)).toBe(true);
        expect(Math.abs(out[0]!)).toBeLessThanOrEqual(Math.PI);
        expect(Math.abs(out[1]!)).toBeLessThanOrEqual(Math.PI / 2);
      }
    }
  });
});

describe('peirce — S#2 conformality', () => {
  it('the forward Jacobian is a scaled rotation (cos φ metric) to 1e-6·‖J‖', () => {
    // Test in PLANE coordinates so a non-square page's anisotropic u/v scale is not blamed.
    const fit = fitOf(16, 9);
    const h = 1e-6;
    let worst = 0;
    let checked = 0;
    for (const [t, p] of grid(256, 128)) {
      if (peirce.singular(t, p, fit)) continue;
      const cp = Math.cos(p);
      const [xt1, yt1] = planeAt(peirce, t + h, p, fit);
      const [xt0, yt0] = planeAt(peirce, t - h, p, fit);
      const [xp1, yp1] = planeAt(peirce, t, p + h, fit);
      const [xp0, yp0] = planeAt(peirce, t, p - h, fit);
      // Columns: ∂/∂θ scaled by 1/cos φ (unit east), ∂/∂φ (unit north).
      const j11 = (xt1 - xt0) / (2 * h * cp);
      const j21 = (yt1 - yt0) / (2 * h * cp);
      const j12 = (xp1 - xp0) / (2 * h);
      const j22 = (yp1 - yp0) / (2 * h);
      // Conformal: J = s·R or s·R·diag(1,−1) (the plane's y is up, the chart's φ is up; orientation is
      // preserved so it is the rotation), i.e. j11 = j22 and j12 = −j21.
      const norm = Math.hypot(j11, j12, j21, j22);
      const defect = Math.abs(j11 - j22) + Math.abs(j12 + j21);
      worst = Math.max(worst, defect / norm);
      checked++;
    }
    expect(checked).toBeGreaterThan(30_000);
    expect(worst).toBeLessThan(1e-6);
    report(`peirce conformality: worst defect ${worst.toExponential(2)} over ${checked} points`);
  });
});

describe('peirce — S#4 fit invariants', () => {
  it.each(ASPECTS)('%s: the page centre is the front point, in both directions', (_n, w, h) => {
    const fit = fitOf(w, h);
    const out = new Float64Array(2);
    expect(peirce.forward(0, 0, fit, out)).toBe(true);
    expect(out[0]).toBeCloseTo(0.5, 14);
    expect(out[1]).toBeCloseTo(0.5, 14);
    expect(peirce.inverse(0.5, 0.5, fit, out)).toBe(true);
    expect(Math.abs(out[0]!)).toBeLessThan(1e-14);
    expect(Math.abs(out[1]!)).toBeLessThan(1e-14);
  });

  it.each(ASPECTS)(
    '%s: the longer page side spans the square; the page is centred and contained',
    (_n, w, h) => {
      const fit = fitOf(w, h);
      expect(fit.kind).toBe('peirce');
      expect(fit.aspect).toBeCloseTo(h / w, 14);
      expect(fit.squareHalf).toBeCloseTo(PEIRCE_SQUARE_HALF, 14);
      expect(Math.max(fit.halfW, fit.halfH)).toBeCloseTo(fit.squareHalf, 14);
      expect(fit.halfH / fit.halfW).toBeCloseTo(h / w, 14);
      expect(Math.min(fit.halfW, fit.halfH)).toBeLessThanOrEqual(fit.squareHalf);
    },
  );

  it.each(ASPECTS)(
    '%s: covered fraction of the sphere is within 1 % of the analytic value',
    (_n, w, h) => {
      const fit = fitOf(w, h);
      const analytic = analyticCoverage(-fit.halfW, fit.halfW, -fit.halfH, fit.halfH);
      // Independent estimate: area-weighted fraction of sphere cells the forward map says are covered.
      const nT = 720;
      const nP = 360;
      const uv = new Float64Array(2);
      let hit = 0;
      let total = 0;
      for (const [t, p] of grid(nT, nP)) {
        const wgt = Math.cos(p);
        total += wgt;
        if (peirce.forward(t, p, fit, uv)) hit += wgt;
      }
      const sampled = hit / total;
      expect(Math.abs(sampled - analytic) / analytic).toBeLessThan(0.01);
      // The spec's rule of thumb (coverage ≈ min(A, 1/A) of the square) is a plane-area statement.
      const planeArea = (fit.halfW * fit.halfH) / (fit.squareHalf * fit.squareHalf);
      expect(planeArea).toBeCloseTo(Math.min(h / w, w / h), 12);
      report(
        `peirce ${w}:${h} coverage analytic ${analytic.toFixed(5)} sampled ${sampled.toFixed(5)}`,
      );
    },
  );

  it('the whole square integrates to the whole sphere (the analytic reference is itself right)', () => {
    const a = PEIRCE_SQUARE_HALF;
    expect(analyticCoverage(-a, a, -a, a, 700)).toBeCloseTo(1, 3);
  });
});

describe('peirce — layout and extended()', () => {
  it('the four singular points are at the square’s edge midpoints, the back pole at its corners', () => {
    const fit = fitOf(1, 1);
    const a = PEIRCE_SQUARE_HALF;
    const cases: Array<[string, number, number, number, number]> = [
      ['east', Math.PI / 2, 0, a, 0],
      ['west', -Math.PI / 2, 0, -a, 0],
      ['north', 0, PHI_MAX, 0, a],
      ['south', 0, PHI_MIN, 0, -a],
    ];
    for (const [name, t, p, ex, ey] of cases) {
      const [x, y] = planeAt(peirce, t, p, fit);
      expect(x, `${name}.x`).toBeCloseTo(ex, 9);
      expect(y, `${name}.y`).toBeCloseTo(ey, 9);
      expect(peirce.singular(t, p, fit), name).toBe(true);
    }
    const [bx, by] = planeAt(peirce, Math.PI - 1e-4, 1e-4, fit);
    expect(Math.hypot(Math.abs(bx) - a, Math.abs(by) - a)).toBeLessThan(1e-3);
    expect(peirce.singular(Math.PI, 0, fit)).toBe(true);
    expect(peirce.singular(0, 0, fit)).toBe(false);
  });

  it('north is up the page and east is to the right', () => {
    const fit = fitOf(1, 1);
    const uv = new Float64Array(2);
    peirce.forward(0, 0.3, fit, uv);
    expect(uv[1]).toBeLessThan(0.5);
    peirce.forward(0.3, 0, fit, uv);
    expect(uv[0]).toBeGreaterThan(0.5);
  });

  it('extended() equals forward() on the page and is finite everywhere, including the singular points', () => {
    const uv = new Float64Array(2);
    const ex = new Float64Array(2);
    for (const [, w, h] of ASPECTS) {
      const fit = fitOf(w, h);
      for (const [t, p] of grid(97, 49)) {
        peirce.extended(t, p, fit, ex);
        expect(Number.isFinite(ex[0]!) && Number.isFinite(ex[1]!)).toBe(true);
        expect(Math.abs(ex[0]!)).toBeLessThanOrEqual(LUT_UV_EXTENT);
        expect(Math.abs(ex[1]!)).toBeLessThanOrEqual(LUT_UV_EXTENT);
        if (peirce.forward(t, p, fit, uv)) {
          expect(ex[0]).toBeCloseTo(uv[0]!, 12);
          expect(ex[1]).toBeCloseTo(uv[1]!, 12);
        }
      }
      const hard: Array<[number, number]> = [
        [0, 0],
        [Math.PI, 0],
        [-Math.PI, 0],
        [Math.PI / 2, 0],
        [-Math.PI / 2, 0],
        [0, Math.PI / 2],
        [0, -Math.PI / 2],
        [1.234, Math.PI / 2],
        [Math.PI, Math.PI / 2],
        [100 * Math.PI, 0.3],
        [Number.NaN, 0],
        [0, Number.NaN],
        [Number.POSITIVE_INFINITY, 0],
        [0, Number.NEGATIVE_INFINITY],
        [Math.PI - 1e-12, 1e-12],
      ];
      for (const [t, p] of hard) {
        peirce.extended(t, p, fit, ex);
        expect(Number.isFinite(ex[0]!) && Number.isFinite(ex[1]!), `${t},${p}`).toBe(true);
      }
    }
  });

  it('extended() glass points continue smoothly past the page edge (nearest-edge clamp is meaningful)', () => {
    const fit = fitOf(21, 9); // wide: glass above and below the page
    const ex = new Float64Array(2);
    peirce.extended(0, 1.2, fit, ex); // near the north pole
    expect(ex[1]).toBeLessThan(0);
    expect(ex[0]).toBeGreaterThan(0);
    expect(ex[0]).toBeLessThan(1);
  });

  it('forward rejects a fit of another projection', () => {
    expect(() =>
      peirce.forward(
        0,
        0,
        { kind: 'mercator', aspect: 1, halfW: 1, halfH: 1, phiMax: 1 },
        new Float64Array(2),
      ),
    ).toThrow(/peirce/);
  });

  it('benchmark: one forward evaluation (target ≤ 2 µs, not gated)', () => {
    const fit = fitOf(16, 9);
    const uv = new Float64Array(2);
    const n = 200_000;
    // Warm-up so the JIT is not billed.
    for (let i = 0; i < 20_000; i++) peirce.forward(i * 0.001, ((i % 100) - 50) * 0.03, fit, uv);
    const t0 = performance.now();
    let sink = 0;
    for (let i = 0; i < n; i++) {
      peirce.forward(
        ((i * 0.6180339887) % 6.283185) - 3.141592,
        (((i * 0.7548776662) % 1) - 0.5) * 3,
        fit,
        uv,
      );
      sink += uv[0]!;
    }
    const us = ((performance.now() - t0) / n) * 1000;
    report(`peirce forward: ${us.toFixed(3)} µs/eval (${n} evals, checksum ${sink.toFixed(1)})`);
    expect(us).toBeGreaterThan(0);
  });
});
