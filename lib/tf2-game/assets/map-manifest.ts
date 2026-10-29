/**
 * The map package contract (v1): what scripts/tf2-game/build-maps.ts writes under
 * `<game>-game/maps/` and the renderer and simulation read. Zod schemas (the build's
 * tests validate every manifest against them) plus the inferred TypeScript types, and
 * the `maps/<sha>.hulls.bin` codec.
 *
 * Storage layout per game (`tf2-game/`, `hl2-game/`, `portal-game/`), served at
 * `/api/<game>-game/assets/<path>`:
 *   - `maps/index.json` (mutable, short cache): `MapIndex`.
 *   - `maps/<sha>.json`: `MapManifest` (content-addressed, immutable).
 *   - `maps/<sha>.bsp`: a valid v19–21 BSP, every lump decompressed, with the pakfile,
 *     cubemap and unused (LDR when HDR is present) lighting lumps emptied — parse it with
 *     lib/tf2-game/formats/bsp.ts `parseBsp`.
 *   - `maps/<sha>.hulls.bin`: prop collision hulls (see `parseHullsBin`).
 *   - `tex/<sha>.webp`: shared with the model channel (same names, deduplicated).
 *
 * Pure and environment-agnostic (browser, workers, Node).
 */
import { z } from 'zod';

export const MAP_PACKAGE_VERSION = 1;

const vec3 = z.tuple([z.number(), z.number(), z.number()]);
const texId = z.string().min(1);

export const mapMaterialSchema = z.object({
  /** Lowercased shader name ("lightmappedgeneric", "worldvertextransition", "water", …; "missing" when no VMT was found). */
  shader: z.string(),
  /** `$basetexture` (texture id into `textures`). */
  base: texId.optional(),
  /** `$basetexture2` (WorldVertexTransition) or `$texture2` (UnlitTwoTexture). */
  base2: texId.optional(),
  /** `$blendmodulatetexture` (WorldVertexTransition). */
  blendModulate: texId.optional(),
  /** Reflectivity (gamma-encoded 0..1): the colour to draw when there is no texture. */
  color: vec3,
  /** `$alphatest`: the cutoff (`$alphatestreference`, default 0.5). */
  alphatest: z.number().optional(),
  translucent: z.literal(true).optional(),
  additive: z.literal(true).optional(),
  nocull: z.literal(true).optional(),
  selfillum: z.literal(true).optional(),
  /** UnlitGeneric / UnlitTwoTexture, and tools/toolsblack. */
  unlit: z.literal(true).optional(),
  /** Tool textures and `%compilenodraw`-style materials: never drawn. */
  nodraw: z.literal(true).optional(),
  /** tools/toolsskybox(2d) and `%compilesky`: draw the sky here. */
  sky: z.literal(true).optional(),
  /** Water shader: fog under the surface. */
  water: z.object({ fogColor: vec3, fogStart: z.number(), fogEnd: z.number() }).optional(),
  /** TextureScroll proxy: texture-space offset per second. */
  scroll: z.tuple([z.number(), z.number()]).optional(),
  /** AnimatedTexture proxy: the VTF's frame count (only frame 0 is stored). */
  frames: z.number().int().optional(),
  /** `$alpha` when below 1. */
  alpha: z.number().optional(),
  vertexAlpha: z.literal(true).optional(),
  decal: z.literal(true).optional(),
  detail: z.never().optional(),
});
export type MapMaterial = z.infer<typeof mapMaterialSchema>;

export const mapTextureSchema = z.object({
  /** `tex/<sha>.webp` (relative to the game's asset root). */
  file: z.string().regex(/^tex\/[a-f0-9]{40}\.webp$/),
  w: z.number().int().positive(),
  h: z.number().int().positive(),
  /** The material uses the texture's alpha and its format carries one. */
  alpha: z.boolean(),
});
export type MapTexture = z.infer<typeof mapTextureSchema>;

const skyFace = texId.optional();
export const mapSkySchema = z.object({
  /** worldspawn `skyname`. */
  name: z.string(),
  faces: z.object({ rt: skyFace, lf: skyFace, bk: skyFace, ft: skyFace, up: skyFace, dn: skyFace }),
  /** The 3D skybox's sky_camera, when the map has one. */
  camera: z.object({ origin: vec3, scale: z.number() }).optional(),
});
export type MapSky = z.infer<typeof mapSkySchema>;

export const mapPropSchema = z.object({
  /** Index into the hulls.bin table; absent when the model has no collision model. */
  hull: z.number().int().nonnegative().optional(),
  /** SOLID_NONE 0, SOLID_BBOX 2, SOLID_VPHYSICS 6 (the largest any instance asks for). */
  solid: z.number().int(),
});
export type MapProp = z.infer<typeof mapPropSchema>;

const mapFile = (ext: string) => z.string().regex(new RegExp(`^maps/[a-f0-9]{64}\\.${ext}$`));

export const mapManifestSchema = z.object({
  v: z.literal(1),
  game: z.enum(['tf2', 'hl2', 'portal']),
  map: z.string(),
  bsp: mapFile('bsp'),
  bspBytes: z.number().int().positive(),
  lighting: z.enum(['hdr', 'ldr']),
  /** Lowercased material path without `materials/` and `.vmt`. */
  materials: z.record(z.string(), mapMaterialSchema),
  /** Texture id (the VTF path without `materials/` and `.vtf`; `@alpha` when kept with alpha). */
  textures: z.record(z.string(), mapTextureSchema),
  sky: mapSkySchema.nullable(),
  /** Every static prop model and every prop/item entity model, by `models/….mdl` path. */
  props: z.record(z.string(), mapPropSchema),
  hulls: mapFile('hulls\\.bin').nullable(),
  nav: mapFile('nav\\.bin').nullable(),
  water: z.array(z.unknown()).optional(),
});
export type MapManifest = z.infer<typeof mapManifestSchema>;

export const mapIndexSchema = z.object({
  v: z.literal(1),
  maps: z.record(
    z.string(),
    z.object({
      manifest: mapFile('json'),
      title: z.string(),
      /** TF2: the game mode (lib/tf2-game/data/maps.ts); HL2 / Portal: 'sp'. */
      mode: z.string(),
      /** Raw bytes of the package: BSP + hulls + manifest + its textures. */
      bytes: z.number().int().nonnegative(),
    }),
  ),
});
export type MapIndex = z.infer<typeof mapIndexSchema>;

// --- hulls.bin ----------------------------------------------------------------
// Little-endian: u32 count; per entry: u32 nConvex; per convex: u32 nVerts, f32 xyz × nVerts
// (model space, Source units — the model's first .phy solid).

/** One entry per model: its convex vertex sets (xyz, flat). */
export type HullTable = Float32Array[][];

export function writeHullsBin(table: HullTable): Uint8Array {
  let size = 4;
  for (const e of table) {
    size += 4;
    for (const c of e) size += 4 + Math.floor(c.length / 3) * 12;
  }
  const out = new Uint8Array(size);
  const view = new DataView(out.buffer);
  let o = 0;
  view.setUint32(o, table.length, true);
  o += 4;
  for (const e of table) {
    view.setUint32(o, e.length, true);
    o += 4;
    for (const c of e) {
      const n = Math.floor(c.length / 3);
      view.setUint32(o, n, true);
      o += 4;
      for (let i = 0; i < n * 3; i++, o += 4) view.setFloat32(o, c[i], true);
    }
  }
  return out;
}

export function parseHullsBin(bytes: Uint8Array): HullTable {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const need = (o: number, n: number) => {
    if (o + n > bytes.length) throw new Error('hulls.bin: truncated');
  };
  need(0, 4);
  let o = 0;
  const count = view.getUint32(o, true);
  o += 4;
  const table: HullTable = [];
  for (let e = 0; e < count; e++) {
    need(o, 4);
    const nConvex = view.getUint32(o, true);
    o += 4;
    const convexes: Float32Array[] = [];
    for (let c = 0; c < nConvex; c++) {
      need(o, 4);
      const n = view.getUint32(o, true);
      o += 4;
      need(o, n * 12);
      const v = new Float32Array(n * 3);
      for (let i = 0; i < n * 3; i++, o += 4) v[i] = view.getFloat32(o, true);
      convexes.push(v);
    }
    table.push(convexes);
  }
  return table;
}
