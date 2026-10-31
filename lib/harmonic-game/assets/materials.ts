/**
 * The material table and the compiler's `MaterialLookup`. Names are `harmonic/<recipe>`.
 * Pure: colours come from the generated textures (cached), nothing touches the DOM.
 */
import type { MaterialInfo, MaterialLookup } from '../compiler/materials';
import { normalizeHarmonicMaterial } from '../compiler/materials';
import { buildTexture, isToolRecipe, textureId, type MaterialRecipe } from './textures';

/** Edge length of every generated texture. */
export const TEXTURE_SIZE = 256;

export interface MaterialDef {
  recipe: MaterialRecipe;
  surfaceProp: string;
  /** World units (inches) one repeat spans. */
  unitsPerRepeat: number;
  translucent?: boolean;
}

const def = (
  kind: MaterialRecipe['kind'],
  seed: number,
  surfaceProp: string,
  unitsPerRepeat: number,
  extra: Partial<MaterialDef> & { alpha?: boolean } = {},
): MaterialDef => ({
  recipe: { kind, seed, ...(extra.alpha ? { alpha: true } : {}) },
  surfaceProp,
  unitsPerRepeat,
  ...(extra.translucent ? { translucent: true } : {}),
});

export const MATERIALS: Record<string, MaterialDef> = {
  'harmonic/concrete': def('concrete', 101, 'concrete', 128),
  'harmonic/steel_plate': def('steel_plate', 102, 'metal', 128),
  'harmonic/steel_rust': def('steel_rust', 103, 'metal', 128),
  'harmonic/paint_white_1971': def('paint_white_1971', 104, 'metal', 128),
  'harmonic/paint_white_2030': def('paint_white_2030', 105, 'metal', 128),
  'harmonic/ice': def('ice', 106, 'ice', 192),
  'harmonic/snow': def('snow', 107, 'snow', 192),
  'harmonic/grating': def('grating', 108, 'metal', 64),
  'harmonic/wood_deck': def('wood_deck', 109, 'wood', 64),
  'harmonic/glass': def('glass', 110, 'glass', 64, { alpha: true, translucent: true }),
  'harmonic/hazard_stripe': def('hazard_stripe', 111, 'metal', 64),
  'harmonic/nodraw': def('nodraw', 0, 'default', 128),
  'harmonic/sky': def('sky', 0, 'default', 128),
};

const linear = (c: number): number =>
  c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
const encode = (c: number): number =>
  c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;

/** Average colour of a texture's pixels (alpha-weighted, averaged in linear light), gamma-encoded 0..1. */
export function averageColor(data: Uint8ClampedArray): [number, number, number] {
  let r = 0;
  let g = 0;
  let b = 0;
  let wsum = 0;
  for (let i = 0; i < data.length; i += 4) {
    const w = data[i + 3] / 255;
    r += linear(data[i] / 255) * w;
    g += linear(data[i + 1] / 255) * w;
    b += linear(data[i + 2] / 255) * w;
    wsum += w;
  }
  if (wsum === 0) return [0, 0, 0];
  return [encode(r / wsum), encode(g / wsum), encode(b / wsum)];
}

const cache = new Map<string, MaterialInfo>();

function build(name: string, d: MaterialDef): MaterialInfo {
  const { recipe } = d;
  if (recipe.kind === 'nodraw')
    return { name, color: [0, 0, 0], nodraw: true, surfaceProp: d.surfaceProp };
  if (recipe.kind === 'sky')
    return { name, color: [0.6, 0.68, 0.76], sky: true, surfaceProp: d.surfaceProp };
  const tex = buildTexture(recipe, TEXTURE_SIZE);
  return {
    name,
    color: averageColor(tex.data),
    texture: { id: textureId(recipe, TEXTURE_SIZE), w: tex.w, h: tex.h, alpha: !!recipe.alpha },
    unitsPerRepeat: d.unitsPerRepeat,
    ...(d.translucent ? { translucent: true } : {}),
    surfaceProp: d.surfaceProp,
  };
}

/** Loud magenta for names the table does not know — valid, but impossible to miss. */
function fallback(name: string): MaterialInfo {
  return { name, color: [1, 0, 1], unitsPerRepeat: 128, surfaceProp: 'default' };
}

export const HARMONIC_MATERIAL_LOOKUP: MaterialLookup = (raw) => {
  const name = normalizeHarmonicMaterial(raw);
  const hit = cache.get(name);
  if (hit) return hit;
  const d = MATERIALS[name];
  const info = d ? build(name, d) : fallback(name);
  cache.set(name, info);
  return info;
};

/** Texture id → recipe, for every textured material (what the browser texture cache serves). */
export function textureRecipes(): Map<string, MaterialRecipe> {
  const out = new Map<string, MaterialRecipe>();
  for (const d of Object.values(MATERIALS)) {
    if (!isToolRecipe(d.recipe)) out.set(textureId(d.recipe, TEXTURE_SIZE), d.recipe);
  }
  return out;
}
