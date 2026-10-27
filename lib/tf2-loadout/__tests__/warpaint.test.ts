import { describe, expect, it } from 'vitest';
import {
  compose,
  fromRgba,
  rng,
  texturesOf,
  toRgba,
  type PaintNode,
  type Raster,
} from '../warpaint';

const solid = (v: [number, number, number], size = 4): Raster => ({
  w: size,
  h: size,
  data: Float32Array.from({ length: size * size * 3 }, (_, i) => v[i % 3]),
});

/** Left half 0, right half 1 (a 4x4 map). */
const halves = (): Raster => {
  const d = new Float32Array(4 * 4 * 3);
  for (let y = 0; y < 4; y++)
    for (let x = 2; x < 4; x++) d.fill(1, (y * 4 + x) * 3, (y * 4 + x) * 3 + 3);
  return { w: 4, h: 4, data: d };
};

const textures: Record<string, Raster> = {
  red: solid([1, 0, 0]),
  blue: solid([0, 0, 1]),
  half: solid([0.5, 0.5, 0.5]),
  // group ids 64 (left) and 96 (right), as the game stores them
  groups: (() => {
    const g = solid([64 / 255, 64 / 255, 64 / 255]);
    for (let y = 0; y < 4; y++)
      for (let x = 2; x < 4; x++) g.data.fill(96 / 255, (y * 4 + x) * 3, (y * 4 + x) * 3 + 3);
    return g;
  })(),
  edge: halves(),
};
const opts = (seed = 1) => ({ size: 4, seed, wear: 1, texture: (p: string) => textures[p] });
const px = (r: Raster, x: number, y = 0) =>
  Array.from(r.data.slice((y * r.w + x) * 3, (y * r.w + x) * 3 + 3));

describe('compose', () => {
  it('multiplies layers', () => {
    const r = compose(['m', ['t', 'red', 0, {}], ['t', 'half', 0, {}]], opts());
    expect(px(r, 1)).toEqual([0.5, 0, 0]);
  });

  it('adds layers, clamped', () => {
    const r = compose(['a', ['t', 'red', 0, {}], ['t', 'half', 0, {}]], opts());
    expect(px(r, 0)).toEqual([1, 0.5, 0.5]);
  });

  it('paints the layer over the base only where the groups mask selects', () => {
    const tree: PaintNode = ['l', ['t', 'red', 0, {}], ['t', 'blue', 0, {}], ['s', 'groups', [96]]];
    const r = compose(tree, opts());
    expect(px(r, 0)).toEqual([1, 0, 0]);
    expect(px(r, 3)).toEqual([0, 0, 1]);
  });

  it('selects several groups, and tolerates a level or two of compression error', () => {
    const tree: PaintNode = ['s', 'groups', [64, 97]];
    const r = compose(tree, opts());
    expect(px(r, 0)).toEqual([1, 1, 1]);
    expect(px(r, 3)).toEqual([1, 1, 1]);
    expect(px(compose(['s', 'groups', [10]], opts()), 0)).toEqual([0, 0, 0]);
  });

  it('applies levels: black point, gamma and offset', () => {
    // 0.5 grey = 127.5; black 127.5 → 0; then +offset 51/255 = 0.2
    const r = compose(['t', 'half', 0, { b: [127.5, 127.5], o: [51, 51] }], opts());
    expect(px(r, 0)[0]).toBeCloseTo(0.2, 3);
    const g = compose(['t', 'half', 0, { g: [2, 2] }], opts());
    expect(px(g, 0)[0]).toBeCloseTo(0.25, 3);
  });

  it('draws the same pattern for the same seed and a different one for another', () => {
    const tree: PaintNode = ['t', 'edge', 0, { r: [0, 360], u: [0, 1], v: [0, 1] }];
    const a = compose(tree, opts(7));
    const b = compose(tree, opts(7));
    const c = compose(tree, opts(8));
    expect(Array.from(a.data)).toEqual(Array.from(b.data));
    expect(Array.from(a.data)).not.toEqual(Array.from(c.data));
  });

  it('draws different values per wear level', () => {
    const tree: PaintNode = ['t', 'edge', 0, { r: [0, 360], u: [0, 1] }];
    const one = compose(tree, { ...opts(7), wear: 1 });
    const two = compose(tree, { ...opts(7), wear: 2 });
    expect(Array.from(one.data)).not.toEqual(Array.from(two.data));
  });

  it('treats a missing texture as grey instead of failing', () => {
    expect(px(compose(['t', 'nope', 0, {}], opts()), 0)).toEqual([0.5, 0.5, 0.5]);
  });

  it('paints the layer when a lerp script has no mask', () => {
    const r = compose(['l', ['t', 'red', 0, {}], ['t', 'blue', 0, {}]], opts());
    expect(px(r, 0)).toEqual([0, 0, 1]);
  });
});

describe('texturesOf / rng / rgba', () => {
  it('lists every texture a tree reads, groups and team variants included', () => {
    const tree: PaintNode = [
      'm',
      ['t', 'a', 'a_red', {}],
      ['l', ['t', 'b', 0, {}], ['t', 'c', 0, {}], ['s', 'g', [1]]],
    ];
    expect([...texturesOf(tree)].sort()).toEqual(['a', 'a_red', 'b', 'c', 'g']);
    expect(texturesOf(null).size).toBe(0);
  });

  it('is a repeatable generator in [0, 1)', () => {
    const a = rng(5);
    const b = rng(5);
    for (let i = 0; i < 50; i++) {
      const v = a();
      expect(v).toBe(b());
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('round-trips 8-bit RGBA', () => {
    const r = solid([1, 0.5, 0], 2);
    const rgba = toRgba(r);
    expect(Array.from(rgba.slice(0, 4))).toEqual([255, 128, 0, 255]);
    expect(fromRgba(rgba, 2, 2).w).toBe(2);
  });
});

describe('paint kit paths', () => {
  it('serves only kit scripts and kit textures', async () => {
    const { isSafePaintkitPath } = await import('../paintkits.server');
    expect(isSafePaintkitPath('kits/concealedkiller_sniperrifle_nightowl.json')).toBe(true);
    expect(isSafePaintkitPath('tex/patterns/camo/geometric.webp')).toBe(true);
    expect(isSafePaintkitPath('tex/models/weapons/c_models/c_pistol/p_pistol_groups.webp')).toBe(
      true,
    );
    for (const bad of [
      'kits/../secret.json',
      'tex/../x.webp',
      'kits/a/b.json',
      'tex/a.png',
      '_state.json',
      'kits/UPPER.json',
      'tex//x.webp',
    ]) {
      expect(isSafePaintkitPath(bad)).toBe(false);
    }
  });
});
