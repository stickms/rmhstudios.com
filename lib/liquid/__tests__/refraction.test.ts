import { describe, expect, it } from 'vitest';
import {
  DISPERSION,
  MAX_MAP_PIXELS,
  buildDisplacementMap,
  displacementProfile,
  filterMarkup,
  mapScaleFor,
  peakDisplacement,
  quantizeSurface,
  sampleProfile,
} from '../refraction';

const px = (m: ReturnType<typeof buildDisplacementMap>, x: number, y: number) => {
  const i = (y * m.width + x) * 4;
  return { r: m.data[i] - 128, g: m.data[i + 1] - 128, b: m.data[i + 2], a: m.data[i + 3] };
};

describe('refraction profile', () => {
  it('is normalised, strongest at the rim and exactly zero in the flat interior', () => {
    const p = displacementProfile();
    expect(Math.max(...p)).toBeCloseTo(1, 6);
    expect(p[p.length - 1]).toBe(0);
    expect(sampleProfile(0)).toBeGreaterThan(0.5);
    expect(sampleProfile(0.02)).toBeGreaterThan(sampleProfile(0.5));
    expect(sampleProfile(0.5)).toBeGreaterThan(sampleProfile(0.95));
    expect(sampleProfile(1)).toBe(0);
    expect(sampleProfile(-3)).toBe(sampleProfile(0));
    expect(sampleProfile(9)).toBe(0);
  });
});

describe('displacement map', () => {
  const spec = { width: 120, height: 80, radius: 24, bezel: 16 };
  const map = buildDisplacementMap(spec);

  it('has the requested grid, opaque alpha and a neutral blue channel', () => {
    expect(map.width).toBe(120);
    expect(map.height).toBe(80);
    expect(map.data.length).toBe(120 * 80 * 4);
    const c = px(map, 60, 40);
    expect(c.a).toBe(255);
    expect(c.b).toBe(128);
  });

  it('is neutral beyond the bezel', () => {
    expect(px(map, 60, 40)).toMatchObject({ r: 0, g: 0 });
    expect(px(map, 40, 40)).toMatchObject({ r: 0, g: 0 });
  });

  it('pushes every edge inward (samples the interior, never outside the backdrop)', () => {
    expect(px(map, 1, 40).r).toBeGreaterThan(40);
    expect(Math.abs(px(map, 1, 40).g)).toBeLessThan(2);
    expect(px(map, 118, 40).r).toBeLessThan(-40);
    expect(px(map, 60, 1).g).toBeGreaterThan(40);
    expect(px(map, 60, 78).g).toBeLessThan(-40);
  });

  it('points diagonally inward around rounded corners', () => {
    const tl = px(map, 5, 5);
    expect(tl.r).toBeGreaterThan(0);
    expect(tl.g).toBeGreaterThan(0);
    const br = px(map, 114, 74);
    expect(br.r).toBeLessThan(0);
    expect(br.g).toBeLessThan(0);
  });

  it('decays monotonically with depth along a straight edge', () => {
    let last = Infinity;
    for (let x = 0; x < 16; x++) {
      const r = px(map, x, 40).r;
      expect(r).toBeLessThanOrEqual(last + 1);
      last = r;
    }
  });

  it('is mirror-symmetric', () => {
    for (const [x, y] of [
      [3, 40],
      [10, 12],
      [30, 2],
    ]) {
      const a = px(map, x, y);
      const b = px(map, 119 - x, 79 - y);
      expect(a.r).toBe(-b.r + 0);
      expect(a.g).toBe(-b.g + 0);
    }
  });

  it('describes the same surface when downscaled', () => {
    const half = buildDisplacementMap(spec, 0.5);
    expect(half.width).toBe(60);
    expect(half.height).toBe(40);
    expect(px(half, 0, 20).r).toBeGreaterThan(40);
    expect(px(half, 30, 20).r).toBe(0);
  });

  it('clamps an oversized radius and bezel on a tiny surface without NaN', () => {
    const tiny = buildDisplacementMap({ width: 16, height: 16, radius: 99, bezel: 99 });
    expect(tiny.data.every((v) => Number.isFinite(v))).toBe(true);
    const pill = buildDisplacementMap({ width: 200, height: 40, radius: 20, bezel: 18 });
    expect(px(pill, 100, 20).r).toBe(0);
    expect(px(pill, 100, 1).g).toBeGreaterThan(30);
  });
});

describe('surface quantisation and budgets', () => {
  it('snaps to a coarse grid so near sizes share a cached map', () => {
    expect(quantizeSurface(300, 62, 14).key).toBe(quantizeSurface(303, 64, 14).key);
    expect(quantizeSurface(301, 62, 14).key).not.toBe(quantizeSurface(340, 62, 14).key);
  });
  it('keeps radius within the pill and bezel within sane limits', () => {
    const q = quantizeSurface(200, 40, 999);
    expect(q.radius).toBe(20);
    expect(q.bezel).toBeGreaterThanOrEqual(4);
    expect(q.bezel).toBeLessThanOrEqual(24);
    expect(quantizeSurface(1, 1, 0).width).toBeGreaterThanOrEqual(8);
  });
  it('bounds the raster size and peak displacement', () => {
    expect(mapScaleFor(100, 100)).toBe(1);
    const s = mapScaleFor(900, 600);
    expect(s).toBeLessThan(1);
    expect(900 * s * 600 * s).toBeLessThanOrEqual(MAX_MAP_PIXELS * 1.01);
    expect(peakDisplacement(2)).toBe(8);
    expect(peakDisplacement(200)).toBe(36);
  });
});

describe('filter markup', () => {
  const base = {
    id: 'lr-1',
    width: 120,
    height: 80,
    scale: 14,
    href: 'data:image/png;base64,AAAA',
  };
  it('builds one displacement pass by default, in sRGB, pinned to the surface box', () => {
    const m = filterMarkup(base);
    expect(m).toContain('id="lr-1"');
    expect(m).toContain('color-interpolation-filters="sRGB"');
    expect(m).toContain('filterUnits="userSpaceOnUse"');
    expect(m.match(/<feDisplacementMap/g)).toHaveLength(1);
    expect(m).toContain('scale="14"');
  });
  it('splits the channels three ways when dispersive', () => {
    const m = filterMarkup({ ...base, dispersive: true });
    expect(m.match(/<feDisplacementMap/g)).toHaveLength(3);
    expect(m).toContain(`scale="${Math.round(14 * (1 + DISPERSION) * 100) / 100}"`);
    expect(m).toContain(`scale="${Math.round(14 * (1 - DISPERSION) * 100) / 100}"`);
    expect(m.match(/<feComposite/g)).toHaveLength(2);
  });
});
