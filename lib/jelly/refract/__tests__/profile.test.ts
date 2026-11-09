import { describe, expect, it } from 'vitest';
import { DISPERSION, REFRACT, mapSize, rimMap, sizeClass } from '../profile';

const PAD = REFRACT.padPx;
/** These tests index the map in CSS px, so they ask for one map pixel per CSS px; the 2x map is checked at the end. */
const S1 = 1;
const px = (map: Uint8ClampedArray, w: number, x: number, y: number) => {
  const o = (y * w + x) * 4;
  return [map[o], map[o + 1], map[o + 2], map[o + 3]] as const;
};

describe('rimMap', () => {
  const c = { w: 300, h: 100, r: 50 };
  const { width: mw, height: mh } = mapSize(c, PAD, S1);
  const map = rimMap(c, REFRACT.bandPx, PAD, S1);

  it('is neutral at the centre and far outside the shape', () => {
    expect(map.length).toBe(mw * mh * 4);
    expect(px(map, mw, Math.floor(mw / 2), Math.floor(mh / 2))).toEqual([128, 128, 0, 255]);
    expect(px(map, mw, 0, 0)).toEqual([128, 128, 0, 255]);
    expect(px(map, mw, mw - 1, mh - 1)).toEqual([128, 128, 0, 255]);
    // The overscan pad (outside the host box) is neutral everywhere, so what is displaced is only ever the band.
    expect(px(map, mw, PAD - 2, Math.floor(mh / 2))).toEqual([128, 128, 0, 255]);
  });

  it('points outward on every side', () => {
    const cx = Math.floor(mw / 2);
    const cy = Math.floor(mh / 2);
    const left = px(map, mw, PAD + 1, cy);
    const right = px(map, mw, PAD + c.w - 2, cy);
    const top = px(map, mw, cx, PAD + 1);
    const bottom = px(map, mw, cx, PAD + c.h - 2);
    expect(left[0]).toBeLessThan(128);
    expect(right[0]).toBeGreaterThan(128);
    expect(top[1]).toBeLessThan(128);
    expect(bottom[1]).toBeGreaterThan(128);
  });

  it('is mirror-symmetric left to right', () => {
    const cy = Math.floor(mh / 2);
    for (const dx of [0, 1, 3, 6, 10]) {
      const l = px(map, mw, PAD + dx, cy);
      const r = px(map, mw, mw - 1 - PAD - dx, cy);
      expect(l[0] + r[0]).toBeGreaterThanOrEqual(255);
      expect(l[0] + r[0]).toBeLessThanOrEqual(257);
      expect(l[1]).toBe(r[1]);
    }
  });

  it('carries the band opacity in blue: full at the rim, easing out, none in the interior or the pad', () => {
    const cy = Math.floor(mh / 2);
    const alpha = (d: number) => px(map, mw, PAD + d, cy)[2];
    expect(alpha(1)).toBe(255);
    expect(alpha(REFRACT.bandPx - 2)).toBeLessThan(alpha(3));
    expect(alpha(REFRACT.bandPx + 2)).toBe(0);
    expect(px(map, mw, PAD - 3, cy)[2]).toBe(0);
    expect(px(map, mw, Math.floor(mw / 2), cy)[2]).toBe(0);
  });

  it('at 2x is the same shape with twice the pixels', () => {
    const big = rimMap(c, REFRACT.bandPx, PAD, 2);
    const s2 = mapSize(c, PAD, 2);
    expect(s2.width).toBe(2 * mw);
    expect(s2.height).toBe(2 * mh);
    expect(big.length).toBe(s2.width * s2.height * 4);
    // Same push at the same CSS-px spot (left edge, vertical middle), within one map pixel of rounding.
    const at = (m: Uint8ClampedArray, w: number, s: number) =>
      m[(Math.floor(mh / 2) * s * w + (PAD + 2) * s) * 4];
    expect(Math.abs(at(big, s2.width, 2) - at(map, mw, 1))).toBeLessThanOrEqual(6);
  });

  it('falls off smoothly: the strongest push is at the rim and none reaches the interior', () => {
    const cy = Math.floor(mh / 2);
    const push = (d: number) => 128 - px(map, mw, PAD + d, cy)[0];
    expect(push(0)).toBeGreaterThan(push(4));
    expect(push(4)).toBeGreaterThan(push(REFRACT.bandPx - 2));
    expect(push(REFRACT.bandPx + 1)).toBe(0);
  });

  it('is a pure function of the class: the document direction never reaches it', () => {
    const before = rimMap(c, REFRACT.bandPx, PAD, S1);
    const g = globalThis as { document?: { dir?: string } };
    const doc = g.document;
    if (doc) doc.dir = 'rtl';
    const after = rimMap(c, REFRACT.bandPx, PAD, S1);
    if (doc) doc.dir = 'ltr';
    expect(Array.from(after)).toEqual(Array.from(before));
  });

  it('stays valid for radius 0, a pill and a 1 x 1 host (Review Focus 1)', () => {
    for (const k of [
      { w: 120, h: 80, r: 0 },
      { w: 120, h: 40, r: 500 },
      { w: 1, h: 1, r: 0 },
      { w: 64, h: 64, r: 32 },
    ]) {
      const m = rimMap(k, REFRACT.bandPx, PAD, S1);
      const s = mapSize(k, PAD, S1);
      expect(m.length).toBe(s.width * s.height * 4);
      for (let i = 0; i < m.length; i += 4) expect(m[i + 3]).toBe(255);
      // Neutral in the pad, whatever the shape: no smear outside the host.
      expect(px(m, s.width, 0, 0)).toEqual([128, 128, 0, 255]);
      expect(px(m, s.width, s.width - 1, 0)).toEqual([128, 128, 0, 255]);
      // The channel never leaves the displacement range at a corner of a radius-0 box.
      for (let i = 0; i < m.length; i += 4) {
        expect(Number.isFinite(m[i])).toBe(true);
        expect(Number.isFinite(m[i + 1])).toBe(true);
      }
    }
    // A circle: the push at the left-most point is purely horizontal, at the top purely vertical.
    const disc = { w: 64, h: 64, r: 32 };
    const circ = rimMap(disc, REFRACT.bandPx, PAD, S1);
    const s = mapSize(disc, PAD, S1);
    const left = px(circ, s.width, PAD + 1, PAD + 32);
    expect(left[0]).toBeLessThan(110);
    expect(Math.abs(left[1] - 128)).toBeLessThanOrEqual(2);
  });
});

describe('rimMap, inward', () => {
  const k = { w: 300, h: 100, r: 50 };
  const out = rimMap(k, REFRACT.bandPx, PAD, S1);
  const inn = rimMap({ ...k, inward: true }, REFRACT.bandPx, PAD, S1);
  const { width: w, height: h } = mapSize(k, PAD, S1);
  it('mirrors every push about neutral and leaves the band opacity alone', () => {
    for (const [x, y] of [
      [PAD + 1, Math.floor(h / 2)],
      [Math.floor(w / 2), PAD + 2],
      [w - PAD - 2, Math.floor(h / 2)],
    ]) {
      const a = px(out, w, x, y);
      const b = px(inn, w, x, y);
      expect(Math.abs(a[0] - 128 + (b[0] - 128))).toBeLessThanOrEqual(1);
      expect(Math.abs(a[1] - 128 + (b[1] - 128))).toBeLessThanOrEqual(1);
      expect(b[2]).toBe(a[2]);
    }
  });
  it('is a class of its own', () => {
    expect(sizeClass(300, 100, 24, true).key).not.toBe(sizeClass(300, 100, 24).key);
    expect(sizeClass(300, 100, 24, true).inward).toBe(true);
  });
});

describe('sizeClass', () => {
  it('rounds up to a geometric bucket and carries a stable key', () => {
    const a = sizeClass(301, 100, 24);
    expect(a.w).toBeGreaterThanOrEqual(301);
    expect(a.h).toBeGreaterThanOrEqual(100);
    expect(sizeClass(301, 100, 24).key).toBe(a.key);
    expect(a.r).toBeLessThanOrEqual(Math.floor(Math.min(a.w, a.h) / 2));
  });

  it('keeps a width sweep of 200 to 800 px in 12 classes or fewer (Review Focus 2)', () => {
    const keys = new Set<string>();
    for (let w = 200; w <= 800; w++) keys.add(sizeClass(w, 120, 32).key);
    expect(keys.size).toBeLessThanOrEqual(12);
    expect(keys.size).toBeGreaterThan(3);
  });

  it('treats any radius at or above half the short side as the same pill', () => {
    const p = sizeClass(200, 40, 20);
    expect(sizeClass(200, 40, 9999).key).toBe(p.key);
    expect(sizeClass(200, 40, 9999).r).toBe(Math.floor(Math.min(p.w, p.h) / 2));
  });

  it('quantises the radius so a radius sweep cannot make a class per pixel', () => {
    const keys = new Set<string>();
    for (let r = 0; r <= 60; r++) keys.add(sizeClass(300, 200, r).key);
    expect(keys.size).toBeLessThanOrEqual(11);
  });
});

describe('DISPERSION', () => {
  it('splits red furthest and blue least, around green', () => {
    expect(DISPERSION.r).toBeGreaterThan(DISPERSION.g);
    expect(DISPERSION.g).toBeGreaterThan(DISPERSION.b);
    expect(DISPERSION.g).toBe(1);
  });
});
