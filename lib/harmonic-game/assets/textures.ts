/**
 * Procedural texture recipes → RGBA pixels. Pure and deterministic (no canvas, no DOM, no
 * Math.random): the same recipe and size always give the same bytes, and every texture tiles.
 */
import { cellular, fbm, hash01, valueNoise } from './rng';
import { PALETTE, clamp01, mixRgb, shade, type Rgb } from './palette';
import { sha1Hex } from './sha1';

export type RecipeKind =
  | 'concrete'
  | 'steel_plate'
  | 'steel_rust'
  | 'paint_white_1971'
  | 'paint_white_2030'
  | 'ice'
  | 'snow'
  | 'grating'
  | 'wood_deck'
  | 'glass'
  | 'hazard_stripe'
  | 'nodraw'
  | 'sky';

export interface MaterialRecipe {
  kind: RecipeKind;
  /** Noise seed. */
  seed: number;
  /** Whether the texture uses alpha. */
  alpha?: boolean;
}

export interface BuiltTexture {
  data: Uint8ClampedArray;
  w: number;
  h: number;
}

/** True for tool materials that have no texture at all. */
export function isToolRecipe(r: MaterialRecipe): boolean {
  return r.kind === 'nodraw' || r.kind === 'sky';
}

/** Bump when a generator changes so cached/content-addressed ids change with it. */
const GENERATOR_VERSION = 1;

/** Canonical JSON of a recipe at a size (keys sorted) — the input to the texture id. */
export function canonicalRecipeJson(recipe: MaterialRecipe, size: number): string {
  const o: Record<string, unknown> = { v: GENERATOR_VERSION, size };
  for (const k of Object.keys(recipe).sort())
    o[k] = (recipe as unknown as Record<string, unknown>)[k];
  return JSON.stringify(o, Object.keys(o).sort());
}

/** 40-hex content id of a recipe at a size (the manifest file is `tex/<id>.webp`). */
export function textureId(recipe: MaterialRecipe, size: number): string {
  return sha1Hex(canonicalRecipeJson(recipe, size));
}

type Px = [number, number, number, number];

interface Ctx {
  u: number;
  v: number;
  x: number;
  y: number;
  size: number;
  seed: number;
}

const rgba = (c: Rgb, a = 255): Px => [c[0], c[1], c[2], a];

function concrete({ u, v, x, y, seed }: Ctx): Px {
  const large = fbm(seed, u, v, 3, 3, 4);
  const fine = fbm(seed + 7, u, v, 32, 32, 2);
  const speck = hash01(seed + 3, x, y);
  let c = mixRgb(PALETTE.concreteDark, PALETTE.concreteLight, large * 0.8 + fine * 0.35);
  if (speck > 0.985) c = shade(c, 0.6);
  else if (speck < 0.01) c = shade(c, 1.15);
  // shallow pits
  const pit = fbm(seed + 19, u, v, 12, 12, 2);
  if (pit > 0.72) c = shade(c, 0.78);
  return rgba(c);
}

function steelPlate({ u, v, x, y, size, seed }: Ctx): Px {
  const cells = 2;
  const cell = size / cells;
  const px = ((x % cell) + cell) % cell;
  const py = ((y % cell) + cell) % cell;
  const id = Math.floor(x / cell) + cells * Math.floor(y / cell);
  const tint = hash01(seed, id, 0) * 0.18 - 0.09;
  // brushed grain: noise stretched along x
  const grain = fbm(seed + 5, u, v, 2, 96, 2);
  let c = mixRgb(PALETTE.steelDark, PALETTE.steelLight, 0.45 + (grain - 0.5) * 0.5 + tint);
  const seam = Math.max(1, size / 128);
  const edge = Math.min(px, py, cell - 1 - px, cell - 1 - py);
  if (edge < seam) c = mixRgb(c, PALETTE.steelSeam, 0.9);
  else if (edge < seam * 2.5) c = shade(c, px < py || px > cell - py ? 1.12 : 0.9);
  // rivets along the border of each plate
  const spacing = cell / 8;
  const inset = seam * 6;
  const onX =
    Math.abs(py - inset) < spacing * 0.5 || Math.abs(py - (cell - 1 - inset)) < spacing * 0.5;
  const onY =
    Math.abs(px - inset) < spacing * 0.5 || Math.abs(px - (cell - 1 - inset)) < spacing * 0.5;
  if (onX || onY) {
    const gx = (px - inset) / spacing;
    const gy = (py - inset) / spacing;
    const cx = (Math.round(gx) * spacing + inset) | 0;
    const cy = (Math.round(gy) * spacing + inset) | 0;
    const rx = onX ? cx : onY ? px : cx;
    const ry = onY ? cy : py;
    const d = Math.hypot(px - rx, py - ry);
    const r = Math.max(1.5, size / 90);
    if (d < r && Math.min(px, py, cell - px, cell - py) > inset * 0.5) {
      c = shade(c, d < r * 0.5 ? 1.35 : 0.65);
    }
  }
  return rgba(c);
}

function steelRust(ctx: Ctx): Px {
  const { u, v, seed } = ctx;
  const base = steelPlate(ctx);
  const blotch = fbm(seed + 31, u, v, 4, 4, 5);
  const streak = fbm(seed + 37, u, v, 24, 3, 3);
  const amount = clamp01((blotch * 0.7 + streak * 0.5 - 0.42) * 3.2);
  const rustTone = mixRgb(PALETTE.rustDark, PALETTE.rustLight, fbm(seed + 41, u, v, 16, 16, 3));
  const c = mixRgb([base[0], base[1], base[2]], rustTone, amount);
  return rgba(c);
}

function enamelBase({ u, v, x, y, size, seed }: Ctx, tone: Rgb): [number, number, number] {
  const peel = fbm(seed + 2, u, v, 64, 64, 2); // orange-peel texture
  let c = shade(tone, 0.97 + peel * 0.06);
  const cell = size / 2;
  const edge = Math.min(((x % cell) + cell) % cell, ((y % cell) + cell) % cell);
  if (edge < Math.max(1, size / 256)) c = shade(c, 0.78);
  return c;
}

function paint1971(ctx: Ctx): Px {
  return rgba(enamelBase(ctx, PALETTE.enamelWhite));
}

function paint2030(ctx: Ctx): Px {
  const { u, v, seed } = ctx;
  let c = enamelBase(ctx, PALETTE.enamelAged);
  // vertical grime runs
  const run = fbm(seed + 11, u, v, 40, 3, 3);
  c = mixRgb(c, PALETTE.enamelGrime, clamp01((run - 0.5) * 1.6));
  // peeling: where the mask is high the paint is gone, rust beneath, with a lit chip edge
  const mask = fbm(seed + 13, u, v, 5, 5, 5);
  const t = 0.56;
  if (mask > t) {
    const rust = mixRgb(PALETTE.rustDark, PALETTE.rustMid, fbm(seed + 17, u, v, 20, 20, 3));
    const lip = clamp01(1 - (mask - t) * 22);
    return rgba(mixRgb(rust, PALETTE.enamelWhite, lip * 0.6));
  }
  return rgba(c);
}

function ice({ u, v, seed }: Ctx): Px {
  const cl = cellular(seed, u, v, 6);
  const crack = clamp01(1 - (cl.f2 - cl.f1) * 9);
  const cl2 = cellular(seed + 1, u, v, 11);
  const crack2 = clamp01(1 - (cl2.f2 - cl2.f1) * 12) * 0.5;
  const cloud = fbm(seed + 5, u, v, 3, 3, 4);
  let c = mixRgb(PALETTE.iceBlue, PALETTE.iceWhite, cloud * 0.9);
  c = mixRgb(c, PALETTE.iceDeep, clamp01(cl.f1 * 0.35 + (1 - cloud) * 0.2));
  c = mixRgb(c, PALETTE.iceWhite, Math.max(crack, crack2) * 0.7);
  const bubble = fbm(seed + 9, u, v, 28, 28, 1);
  if (bubble > 0.85) c = shade(c, 1.12);
  return rgba(c);
}

function snow({ u, v, x, y, seed }: Ctx): Px {
  const drift = fbm(seed, u, v, 4, 4, 5);
  let c = mixRgb(PALETTE.snowShade, PALETTE.snowWhite, 0.55 + drift * 0.6);
  if (hash01(seed + 3, x, y) > 0.995) c = mixRgb(c, [255, 255, 255], 0.8);
  return rgba(c);
}

function grating({ x, y, size, seed, u, v }: Ctx): Px {
  const cells = 8;
  const cell = size / cells;
  const px = ((x % cell) + cell) % cell;
  const py = ((y % cell) + cell) % cell;
  const bar = Math.max(1.5, cell * 0.22);
  const onBar = px < bar || py < bar;
  if (!onBar) return rgba(PALETTE.grateVoid);
  const edge = Math.min(px, py);
  const wear = fbm(seed, u, v, 6, 6, 3);
  const c = mixRgb(PALETTE.steelMid, PALETTE.steelLight, wear);
  return rgba(shade(c, edge < 1 ? 1.2 : 1));
}

function woodDeck({ u, v, x, y, size, seed }: Ctx): Px {
  const planks = 4;
  const ph = size / planks;
  const row = Math.floor(y / ph);
  const py = ((y % ph) + ph) % ph;
  const rowShift = hash01(seed, row, 5);
  const tone = hash01(seed, row, 1);
  const grain = fbm(seed + row, (u + rowShift) % 1, v, 3, 96, 3);
  const fine = valueNoise(seed + 77, u * 8, v * 128, 8, 128);
  let c = mixRgb(
    PALETTE.deckDark,
    PALETTE.deckLight,
    0.25 + tone * 0.35 + (grain - 0.5) * 0.7 + (fine - 0.5) * 0.1,
  );
  const seam = Math.max(1, size / 128);
  if (py < seam || py > ph - seam) c = shade(c, 0.45);
  // butt joint once per plank, nails beside it
  const joint = Math.floor(rowShift * size);
  if (Math.abs(x - joint) < seam * 0.7) c = shade(c, 0.5);
  if (Math.hypot(x - ((joint + 8) % size), py - ph * 0.5) < Math.max(1.5, size / 100))
    c = shade(c, 0.5);
  return rgba(c);
}

function glass({ u, v, seed }: Ctx): Px {
  const streak = fbm(seed, u, v, 2, 12, 3);
  const diag = ((u + v) * 3) % 1;
  const sheen = diag < 0.08 ? 0.3 : 0;
  const c = mixRgb(PALETTE.glassTint, [255, 255, 255], sheen + streak * 0.12);
  return rgba(c, Math.round(70 + streak * 40 + sheen * 220));
}

function hazard({ u, v, seed }: Ctx): Px {
  const stripes = 4;
  const band = ((((u + v) * stripes) % 1) + 1) % 1;
  const base = band < 0.5 ? PALETTE.amber : PALETTE.hazardBlack;
  const wear = fbm(seed, u, v, 8, 8, 4);
  let c = shade(base, 0.85 + wear * 0.3);
  if (fbm(seed + 3, u, v, 16, 16, 3) > 0.7) c = mixRgb(c, PALETTE.steelMid, 0.5); // chipped to metal
  return rgba(c);
}

const GENERATORS: Record<Exclude<RecipeKind, 'nodraw' | 'sky'>, (c: Ctx) => Px> = {
  concrete,
  steel_plate: steelPlate,
  steel_rust: steelRust,
  paint_white_1971: paint1971,
  paint_white_2030: paint2030,
  ice,
  snow,
  grating,
  wood_deck: woodDeck,
  glass,
  hazard_stripe: hazard,
};

/** Generates a size x size RGBA texture (tool recipes give 1x1 transparent black). */
export function buildTexture(recipe: MaterialRecipe, size: number): BuiltTexture {
  if (recipe.kind === 'nodraw' || recipe.kind === 'sky') {
    return { data: new Uint8ClampedArray(4), w: 1, h: 1 };
  }
  const gen = GENERATORS[recipe.kind];
  const data = new Uint8ClampedArray(size * size * 4);
  const ctx: Ctx = { u: 0, v: 0, x: 0, y: 0, size, seed: recipe.seed };
  let o = 0;
  for (let y = 0; y < size; y++) {
    ctx.y = y;
    ctx.v = y / size;
    for (let x = 0; x < size; x++) {
      ctx.x = x;
      ctx.u = x / size;
      const p = gen(ctx);
      data[o++] = p[0];
      data[o++] = p[1];
      data[o++] = p[2];
      data[o++] = p[3];
    }
  }
  return { data, w: size, h: size };
}
