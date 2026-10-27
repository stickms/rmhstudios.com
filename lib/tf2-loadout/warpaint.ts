/**
 * War paint compositor: runs a kit's pattern script (see scripts/tf2-assets/paintkits.py) to make the
 * texture a painted weapon is drawn with.
 *
 * The game builds that texture from a tree of operations over its own texture files: `t` looks a
 * texture up (rotated, scaled, offset and level-adjusted by values drawn once from the seed), `m`
 * multiplies layers, `a` adds them, `l` blends the second over the first by a mask, and `s` is a mask
 * from a weapon's "groups" map (each region of the weapon has an id). Pure and DOM-free, so it runs in a
 * worker and in the tests; textures arrive as {@link Raster}s.
 *
 * What is exact and what is not: the tree, the groups masks and the layering are the game's. The seed's
 * random draws are ours (the game's generator is not public), so the same seed gives the same paint here
 * every time but not necessarily the same one the game would; and the level adjustment (black, offset,
 * gamma) is our reading of those three numbers.
 */

import type { CatalogItem, LoadoutEntry } from './catalog-types';
import type { CatalogIndex } from './use-catalog';

export type Range = [number, number];

export interface TexParams {
  /** rotation, degrees */
  r?: Range;
  /** translate u, v (fractions of the texture) */
  u?: Range;
  v?: Range;
  /** scale_uv: how many times the pattern repeats across the weapon's texture */
  s?: Range;
  /** adjust_black, adjust_offset (0-255), adjust_gamma */
  b?: Range;
  o?: Range;
  g?: Range;
}

export type PaintNode =
  | ['t', string, string | 0, TexParams]
  | ['m' | 'a', ...PaintNode[]]
  | ['l', ...PaintNode[]]
  | ['s', string, number[]];

export interface KitScript {
  v: 1;
  /** One tree per wear level, 1 (Factory New) to 5 (Battle Scarred). */
  w: (PaintNode | null)[];
}

/** Interleaved RGB, 0-1. */
export interface Raster {
  w: number;
  h: number;
  data: Float32Array;
}

/** The texture paths a wear level reads, so they can be loaded before the (synchronous) composite. */
export function texturesOf(node: PaintNode | null, into = new Set<string>()): Set<string> {
  if (!node) return into;
  if (node[0] === 't') {
    into.add(node[1]);
    if (node[2]) into.add(node[2]);
  } else if (node[0] === 's') {
    into.add(node[1]);
  } else {
    for (const child of node.slice(1) as PaintNode[]) texturesOf(child, into);
  }
  return into;
}

/** A small, fast, seedable generator (mulberry32). */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
const wrap01 = (x: number) => x - Math.floor(x);

function blank(size: number, value: number): Raster {
  return { w: size, h: size, data: new Float32Array(size * size * 3).fill(value) };
}

/** Bilinear sample with wrapping (the patterns tile). */
function sampleWrap(tex: Raster, u: number, v: number, out: Float32Array, o: number): void {
  const x = wrap01(u) * tex.w - 0.5;
  const y = wrap01(v) * tex.h - 0.5;
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  const xa = ((x0 % tex.w) + tex.w) % tex.w;
  const xb = (xa + 1) % tex.w;
  const ya = ((y0 % tex.h) + tex.h) % tex.h;
  const yb = (ya + 1) % tex.h;
  const d = tex.data;
  for (let c = 0; c < 3; c++) {
    const top = lerp(d[(ya * tex.w + xa) * 3 + c], d[(ya * tex.w + xb) * 3 + c], fx);
    const bot = lerp(d[(yb * tex.w + xa) * 3 + c], d[(yb * tex.w + xb) * 3 + c], fx);
    out[o + c] = lerp(top, bot, fy);
  }
}

export interface RenderOptions {
  /** Output size in pixels (a square). */
  size: number;
  seed: number;
  wear: number;
  /** A texture by path; missing ones are treated as mid grey. */
  texture: (path: string) => Raster | undefined;
}

const GREY: Raster = { w: 1, h: 1, data: new Float32Array([0.5, 0.5, 0.5]) };

/**
 * Composite one wear level. The random values for each texture lookup are drawn in tree order, seven per
 * lookup whether or not the script gives a range, so adding a range to a script never reshuffles the
 * others.
 */
export function compose(tree: PaintNode, opts: RenderOptions): Raster {
  const { size } = opts;
  const rand = rng((opts.seed * 2654435761 + opts.wear * 40503) >>> 0);
  const draw = (r: Range | undefined, fallback: number): number => {
    const t = rand();
    return r ? lerp(r[0], r[1], t) : fallback;
  };

  const lookup = (node: Extract<PaintNode, { 0: 't' }>): Raster => {
    const p = node[3];
    const tex = opts.texture(node[1]) ?? GREY;
    const rot = (draw(p.r, 0) * Math.PI) / 180;
    const du = draw(p.u, 0);
    const dv = draw(p.v, 0);
    const scale = draw(p.s, 1);
    const black = draw(p.b, 0);
    const offset = draw(p.o, 0);
    const gamma = draw(p.g, 1);
    const out = blank(size, 0);
    const c = Math.cos(rot);
    const s = Math.sin(rot);
    const plain = !p.r && !p.u && !p.v && !p.s;
    const adjust = black !== 0 || offset !== 0 || gamma !== 1;
    const span = 255 - black;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const o = (y * size + x) * 3;
        let u = (x + 0.5) / size;
        let v = (y + 0.5) / size;
        if (!plain) {
          const px = u - 0.5;
          const py = v - 0.5;
          u = (c * px + s * py) * scale + 0.5 + du;
          v = (-s * px + c * py) * scale + 0.5 + dv;
        }
        sampleWrap(tex, u, v, out.data, o);
      }
    }
    if (adjust) {
      const d = out.data;
      for (let i = 0; i < d.length; i++) {
        let val = d[i] * 255;
        if (black > 0) val = span > 0 ? (Math.max(0, val - black) * 255) / span : 0;
        val /= 255;
        if (gamma !== 1) val = Math.pow(clamp01(val), gamma);
        d[i] = clamp01(val + offset / 255);
      }
    }
    return out;
  };

  const maskOf = (node: Extract<PaintNode, { 0: 's' }>): Raster => {
    const groups = opts.texture(node[1]);
    const out = blank(size, 0);
    if (!groups) return out;
    const ids = node[2];
    for (let y = 0; y < size; y++) {
      const gy = Math.min(groups.h - 1, Math.floor(((y + 0.5) / size) * groups.h));
      for (let x = 0; x < size; x++) {
        const gx = Math.min(groups.w - 1, Math.floor(((x + 0.5) / size) * groups.w));
        const id = Math.round(groups.data[(gy * groups.w + gx) * 3] * 255);
        // a lossy copy of the map can be a level or two off
        if (ids.some((want) => Math.abs(want - id) <= 2)) {
          const o = (y * size + x) * 3;
          out.data[o] = out.data[o + 1] = out.data[o + 2] = 1;
        }
      }
    }
    return out;
  };

  const run = (node: PaintNode): Raster => {
    switch (node[0]) {
      case 't':
        return lookup(node);
      case 's':
        return maskOf(node);
      case 'm':
      case 'a': {
        const kids = (node.slice(1) as PaintNode[]).map(run);
        const acc = kids[0] ?? blank(size, node[0] === 'm' ? 1 : 0);
        for (let k = 1; k < kids.length; k++) {
          const d = kids[k].data;
          for (let i = 0; i < acc.data.length; i++) {
            acc.data[i] = node[0] === 'm' ? acc.data[i] * d[i] : clamp01(acc.data[i] + d[i]);
          }
        }
        return acc;
      }
      case 'l': {
        const kids = (node.slice(1) as PaintNode[]).map(run);
        // base, the layer over it, and the mask between them; a script missing its mask paints the layer
        if (kids.length < 3) return kids[kids.length - 1] ?? blank(size, 0);
        const [base, over, mask] = kids;
        for (let i = 0; i < base.data.length; i++) {
          base.data[i] = lerp(base.data[i], over.data[i], mask.data[i]);
        }
        return base;
      }
    }
  };

  return run(tree);
}

/** 8-bit RGBA for a canvas. */
export function toRgba(r: Raster): Uint8ClampedArray {
  const out = new Uint8ClampedArray(r.w * r.h * 4);
  for (let i = 0, j = 0; i < r.w * r.h; i++, j += 4) {
    out[j] = r.data[i * 3] * 255;
    out[j + 1] = r.data[i * 3 + 1] * 255;
    out[j + 2] = r.data[i * 3 + 2] * 255;
    out[j + 3] = 255;
  }
  return out;
}

/** An 8-bit RGBA image (from a canvas) as a {@link Raster}. */
export function fromRgba(data: Uint8ClampedArray, w: number, h: number): Raster {
  const out = new Float32Array(w * h * 3);
  for (let i = 0, j = 0; i < w * h; i++, j += 4) {
    out[i * 3] = data[j] / 255;
    out[i * 3 + 1] = data[j + 1] / 255;
    out[i * 3 + 2] = data[j + 2] / 255;
  }
  return { w, h, data: out };
}

/** The paint kits' file layout on the model routes. */
export const kitUrl = (script: string): string =>
  `/api/tf2-loadout/paintkits/kits/${encodeURIComponent(script.toLowerCase())}.json`;
export const kitTextureUrl = (path: string): string =>
  `/api/tf2-loadout/paintkits/tex/${path.split('/').map(encodeURIComponent).join('/')}.webp`;

/** A war paint on a weapon: the kit's pattern script, its wear level and seed. */
export interface WarPaint {
  script: string;
  wear: number;
  seed: number;
}

/**
 * The kit an equipped weapon is painted with: a decorated weapon's own (fixed), else the one the player
 * picked for a weapon that takes war paints.
 */
export const kitOf = (item: Pick<CatalogItem, 'sk'> | undefined, entry: LoadoutEntry) =>
  item?.sk ? item.sk.kit : entry.kit;

/** The war paint an equipped weapon shows, if it has a kit that exists for that weapon. */
export function warPaintOf(
  idx: Pick<CatalogIndex, 'item' | 'kit'>,
  entry: LoadoutEntry,
): WarPaint | undefined {
  const item = idx.item(entry.item);
  const kit = kitOf(item, entry);
  if (kit === undefined) return undefined;
  const script = item?.wk ? idx.kit(kit)?.w[item.wk] : undefined;
  return script ? { script, wear: entry.wear ?? 1, seed: entry.seed ?? 0 } : undefined;
}
