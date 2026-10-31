/**
 * The contract between the level compiler (H0.2) and the procedural assets (H0.3).
 *
 * The compiler never knows how a material looks: it asks a `MaterialLookup` for each
 * material name a level uses and writes what it gets into the BspFile (texData, texInfo
 * flags) and the in-memory MapManifest (materials + textures). The assets module supplies
 * the real lookup (`HARMONIC_MATERIAL_LOOKUP` in `assets/materials.ts`); the compiler's own
 * `defaultMaterialLookup` keeps it testable without the assets.
 *
 * Environment-agnostic: no DOM.
 */

/** One material as the compiler needs it. */
export interface MaterialInfo {
  /** Normalised name (lowercase, forward slashes), e.g. `harmonic/steel_plate`. */
  name: string;
  /** Gamma-encoded 0..1 RGB — the manifest's `color` (drawn while/when there is no texture). */
  color: [number, number, number];
  /**
   * The texture, if any. `id` is a 40-hex digest of the recipe (the manifest's file name is
   * `tex/<id>.webp`); `w`/`h` its pixel size; `alpha` whether the material uses alpha.
   */
  texture?: { id: string; w: number; h: number; alpha: boolean };
  /** World units one texture repeat spans (default 128). Sets texInfo textureVecs scale. */
  unitsPerRepeat?: number;
  /** Never drawn, still collides (tool textures). */
  nodraw?: boolean;
  /** Draw the sky here (SURF_SKY). */
  sky?: boolean;
  /** Unlit (self-lit signage, lamps). */
  unlit?: boolean;
  translucent?: boolean;
  /** Surface property for physics/footsteps (`metal`, `ice`, `snow`, `wood`, `glass`, `concrete`). */
  surfaceProp: string;
}

export type MaterialLookup = (name: string) => MaterialInfo;

/** Lowercase, forward slashes — the key every table uses. */
export function normalizeHarmonicMaterial(name: string): string {
  return name.replace(/\\/g, '/').toLowerCase();
}

/** Flat colours only; enough for compiler tests and as a fallback. */
export const defaultMaterialLookup: MaterialLookup = (raw) => {
  const name = normalizeHarmonicMaterial(raw);
  if (name.endsWith('nodraw')) return { name, color: [0, 0, 0], nodraw: true, surfaceProp: 'default' };
  if (name.endsWith('sky')) return { name, color: [0.6, 0.65, 0.7], sky: true, surfaceProp: 'default' };
  return { name, color: [0.5, 0.5, 0.5], surfaceProp: 'concrete' };
};
