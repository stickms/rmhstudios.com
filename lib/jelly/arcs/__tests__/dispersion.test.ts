import { describe, expect, it } from 'vitest';

import {
  DISPERSION,
  channelColours,
  channelOffset,
  fringeColours,
  lightSide,
  rimProximity,
  saturatedRed,
  splitPolyline,
} from '../dispersion';

describe('chromatic dispersion', () => {
  it('is zero at the core and grows monotonically with distance from it', () => {
    expect(channelOffset(0)).toBe(0);
    let last = 0;
    for (let d = 0.5; d <= 40; d += 0.5) {
      const o = channelOffset(d);
      expect(o).toBeGreaterThan(last);
      last = o;
    }
    expect(last).toBeLessThanOrEqual(DISPERSION.maxPx);
  });

  it('splits harder at a rim and inside the gel, and never past the absolute cap', () => {
    const d = 4;
    expect(channelOffset(d, 1)).toBeGreaterThan(channelOffset(d, 0));
    expect(channelOffset(d, 0, 1)).toBeGreaterThan(channelOffset(d, 0, 0));
    expect(channelOffset(d, 0.5)).toBeGreaterThan(channelOffset(d, 0.2));
    for (const rim of [0, 0.5, 1, 7]) {
      for (const gel of [0, 1, 9]) {
        expect(channelOffset(1e6, rim, gel)).toBeLessThanOrEqual(DISPERSION.capPx);
        expect(channelOffset(0, rim, gel)).toBe(0);
      }
    }
    expect(channelOffset(-3)).toBe(0);
    expect(channelOffset(Number.NaN)).toBe(0);
  });

  it('rim proximity is 1 on the rim, symmetric, and falls off with distance', () => {
    expect(rimProximity(0)).toBe(1);
    expect(rimProximity(5)).toBeCloseTo(rimProximity(-5));
    expect(rimProximity(5)).toBeLessThan(1);
    expect(rimProximity(40)).toBeLessThan(rimProximity(5));
    expect(rimProximity(200)).toBeLessThan(1e-3);
  });

  it('offsets each point along its own normal by its own amount', () => {
    // A horizontal line: the normal is vertical, so x stays and y moves by the offset.
    const pts = new Float32Array([0, 10, 10, 10, 20, 10]);
    const out = splitPolyline(pts, new Float32Array([0, 2, 0]), 1);
    expect(Array.from(out.filter((_, i) => i % 2 === 0))).toEqual([0, 10, 20]);
    expect(Math.abs(out[3] - 10)).toBeCloseTo(2);
    expect(out[1]).toBe(10);
    expect(out[5]).toBe(10);
    // The opposite sign moves the other way.
    const neg = splitPolyline(pts, new Float32Array([0, 2, 0]), -1);
    expect(neg[3] - 10).toBeCloseTo(-(out[3] - 10));
  });

  it('puts red on the lit (top-left) side of a bolt whichever way it runs', () => {
    // Left-to-right and right-to-left bolts: the red side (sign +1 normal) points up (−y) either way.
    for (const dir of [1, -1]) {
      const pts = new Float32Array([100 - 50 * dir, 50, 100 + 50 * dir, 50]);
      const s = lightSide(pts);
      const red = splitPolyline(pts, new Float32Array([2, 2]), s);
      expect(red[1]).toBeLessThan(50);
    }
  });

  it('channel colours sum back to the glow and never make a WCAG saturated-red flash', () => {
    const glow: [number, number, number] = [0.49, 0.42, 1];
    const c = channelColours(glow);
    for (let k = 0; k < 3; k++) expect(c.r[k] + c.g[k] + c.b[k]).toBeCloseTo(glow[k], 5);
    expect(saturatedRed(c.r)).toBe(false);
    // Even a pure red glow (the renderer's red clamp normally rotates it first) gives no saturated-red channel.
    const red = channelColours([1, 0, 0]);
    expect(saturatedRed(red.r)).toBe(false);
    expect(saturatedRed([0.9, 0.05, 0.05])).toBe(true);
    expect(saturatedRed([0, 0, 0])).toBe(false);
  });

  it('light-theme fringes lean the glow warm and cool without darkening it or going saturated red', () => {
    const glow: [number, number, number] = [0.55, 0.45, 0.95];
    const f = fringeColours(glow);
    expect(f.g).toEqual(glow);
    expect(f.r[0]).toBeGreaterThan(glow[0]);
    expect(f.b[2]).toBeGreaterThanOrEqual(glow[2]);
    expect(saturatedRed(f.r)).toBe(false);
    expect(saturatedRed(fringeColours([1, 0, 0]).r)).toBe(false);
    const sum = (c: readonly number[]) => c[0] + c[1] + c[2];
    expect(sum(f.r)).toBeGreaterThan(sum(glow) * 0.8);
    expect(sum(f.b)).toBeGreaterThan(sum(glow) * 0.8);
  });
});
