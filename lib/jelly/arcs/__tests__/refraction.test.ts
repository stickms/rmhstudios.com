import { describe, expect, it } from 'vitest';

import type { RoundedRect } from '../geometry';
import { REFRACTION, displaceInside, entryStubs, refract, refractShift } from '../refraction';

const HOST: RoundedRect = { x: 100, y: 100, w: 200, h: 100, r: 24 };

describe('refraction inside the gel', () => {
  it('the shift is exactly zero outside and on the rim, bounded, and continuous at the rim', () => {
    expect(refractShift(-10)).toBe(0);
    expect(refractShift(0)).toBe(0);
    expect(refractShift(Number.NaN)).toBe(0);
    let last = 0;
    for (let d = 0.25; d < 80; d += 0.25) {
      const s = refractShift(d);
      expect(s).toBeGreaterThanOrEqual(last);
      expect(s).toBeLessThanOrEqual(REFRACTION.maxShiftPx);
      // Continuity: no step bigger than the ramp's steepest slope allows.
      expect(s - last).toBeLessThan(
        0.25 * ((1.5 * REFRACTION.maxShiftPx) / REFRACTION.rampPx) + 1e-9,
      );
      last = s;
    }
    expect(refractShift(1e6)).toBe(REFRACTION.maxShiftPx);
    expect(refractShift(0.01)).toBeLessThan(0.001);
  });

  it('points outside every host are left exactly where they are', () => {
    const pts = new Float32Array([10, 10, 50, 150, 99.5, 150, 320, 150]);
    const out = displaceInside(pts, [HOST]);
    expect(Array.from(out)).toEqual(Array.from(pts));
  });

  it('a point inside moves along the local edge normal, inward, by a bounded amount', () => {
    // 6px inside the left edge, at mid height: the normal is −x.
    const pts = new Float32Array([106, 150]);
    const out = displaceInside(pts, [HOST]);
    expect(out[1]).toBeCloseTo(150);
    expect(out[0]).toBeGreaterThan(106);
    expect(out[0] - 106).toBeLessThanOrEqual(REFRACTION.maxShiftPx);
    // Deep inside: the full shift, never more.
    const deep = displaceInside(new Float32Array([150, 150]), [HOST]);
    expect(deep[0] - 150).toBeCloseTo(REFRACTION.maxShiftPx);
  });

  it('refracts by Snell’s law: no bend at normal incidence, bends toward the normal entering the gel', () => {
    const n = { x: -1, y: 0 }; // outward normal of a left edge
    const straight = refract({ x: 1, y: 0 }, n, 1 / 1.33)!;
    expect(straight.x).toBeCloseTo(1);
    expect(straight.y).toBeCloseTo(0);
    const s = Math.sin(Math.PI / 6);
    const oblique = refract({ x: Math.cos(Math.PI / 6), y: s }, n, 1 / 1.33)!;
    expect(Math.hypot(oblique.x, oblique.y)).toBeCloseTo(1);
    expect(oblique.y).toBeCloseTo(s / 1.33);
    expect(oblique.y).toBeLessThan(s);
    // Leaving a denser medium past the critical angle: total internal reflection.
    expect(refract({ x: Math.cos(1.2), y: Math.sin(1.2) }, n, 1.33)).toBeNull();
  });

  it('entry stubs start on the rim, stay inside the host, and fan out by channel with depth', () => {
    const contact = { x: 100, y: 150 };
    const stubs = entryStubs(contact, { x: -1, y: 0 }, { x: 0.9, y: 0.44 }, HOST, 7);
    for (const s of [stubs.r, stubs.g, stubs.b]) {
      expect(s[0]).toBeCloseTo(100);
      expect(s[1]).toBeCloseTo(150);
      for (let i = 2; i < s.length; i += 2) {
        expect(s[i]).toBeGreaterThan(100);
        expect(s[i]).toBeLessThan(300);
        expect(s[i + 1]).toBeGreaterThan(100);
        expect(s[i + 1]).toBeLessThan(200);
      }
    }
    const end = stubs.g.length - 2;
    const spread = Math.hypot(stubs.r[end] - stubs.b[end], stubs.r[end + 1] - stubs.b[end + 1]);
    const near = Math.hypot(stubs.r[2] - stubs.b[2], stubs.r[3] - stubs.b[3]);
    expect(spread).toBeGreaterThan(near);
    expect(spread).toBeGreaterThan(0.5);
    // Depth bounded by the stub depth (and by the host's size).
    expect(Math.hypot(stubs.g[end] - 100, stubs.g[end + 1] - 150)).toBeLessThanOrEqual(
      REFRACTION.stubDepthPx + REFRACTION.maxShiftPx + 2 * REFRACTION.stubJitterPx,
    );
  });

  it('a thin host gets a shorter stub (it never exits the far side)', () => {
    const thin: RoundedRect = { x: 0, y: 0, w: 200, h: 12, r: 6 };
    const stubs = entryStubs({ x: 100, y: 0 }, { x: 0, y: -1 }, { x: 0, y: 1 }, thin, 3);
    for (let i = 0; i < stubs.g.length; i += 2) expect(stubs.g[i + 1]).toBeLessThan(12);
  });
});
