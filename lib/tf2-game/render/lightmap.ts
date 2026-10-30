/**
 * Lightmaps: ColorRGBExp32 decoding, Source's LDR lightmap encoding, and the atlas
 * every world face samples. Pure (no three.js) so it is unit-tested and could move
 * to a worker.
 *
 * The look follows Source's LDR path (SDK: mathlib/color_conversion.cpp
 * BuildGammaTable, LightmappedGeneric): a luxel's linear value L (0..4) is stored as
 * round(255 · L^(1/2.2) / 2) (`lineartolightmap`, overbright 2), and the pixel shader
 * computes albedo × texel × 2 in gamma space. The renderer works in linear space:
 * texel·2 raised to 2.2 recovers L, and albedo_linear × L encoded back to the screen is
 * (up to the sRGB-vs-2.2 curve) the same pixel — including the clamp at L = 4.
 */
import { rgbExp32ToLinear, type BspFace, type BspFile } from '../formats/bsp';

/** SDK OVERBRIGHT (materialsystem/imaterialsystem.h). */
export const OVERBRIGHT = 2;
/** mat_monitorgamma default. */
export const LIGHTMAP_GAMMA = 2.2;

/** SDK lineartolightmap[4096]: index = round(L · 1024), L in 0..4. */
export const LINEAR_TO_LIGHTMAP: Uint8Array = (() => {
  const t = new Uint8Array(4096);
  for (let i = 0; i < 4096; i++) {
    const f = Math.pow(i / 1024, 1 / LIGHTMAP_GAMMA);
    t[i] = Math.max(0, Math.min(255, Math.round(f * 255 * (1 / OVERBRIGHT))));
  }
  return t;
})();

/** SDK LinearToLightmap: linear luxel value → 8-bit lightmap texel. */
export function linearToLightmap(f: number): number {
  let i = Math.round(f * 1024);
  if (!(i >= 0)) i = 0;
  else if (i > 4095) i = 4095;
  return LINEAR_TO_LIGHTMAP[i];
}

/** What the shader recovers from a texel: (texel/255 · 2)^2.2 (linear light). */
export function lightmapTexelToLinear(texel: number): number {
  return Math.pow((texel / 255) * OVERBRIGHT, LIGHTMAP_GAMMA);
}

/** 2^e / 255 for the signed exponent byte (index e + 128). */
const EXP_SCALE: Float32Array = (() => {
  const t = new Float32Array(256);
  for (let e = -128; e < 128; e++) t[e + 128] = Math.pow(2, e) / 255;
  return t;
})();

/** ColorRGBExp32 at byte offset `o` → linear RGB into out[k..k+2] (fast path of rgbExp32ToLinear). */
export function decodeRgbe(src: Uint8Array, o: number, out: Float32Array | number[], k = 0): void {
  const s = EXP_SCALE[((src[o + 3] << 24) >> 24) + 128];
  out[k] = src[o] * s;
  out[k + 1] = src[o + 1] * s;
  out[k + 2] = src[o + 2] * s;
}

export { rgbExp32ToLinear };

/**
 * HDR → LDR calibration. Maps compiled with both lighting passes keep their LDR
 * lightmaps brighter than the HDR ones by a per-map factor (vrad uses `_lightHDR` /
 * `_lightscaleHDR`; TF2 maps keep them equal, HL2/Portal light HDR lower and rely on
 * auto-exposure). When a package ships only the HDR lump, multiply by this so the map
 * reads as bright as its LDR build. Measured as the median luxel ratio LDR/HDR over
 * every face of every published map that has both lumps (render-harness `calibrate`).
 */
export const HDR_TO_LDR_SCALE: Record<'tf2' | 'hl2' | 'portal' | 'csgo', number> = {
  tf2: 1.0,
  hl2: 1.7,
  portal: 1.55,
  // Not yet calibrated: CS:GO's de_dust2 ships HDR lighting only (its package has no LDR to measure).
  csgo: 1.0,
};

/**
 * The median LDR/HDR luxel ratio of a BSP that still has both lighting lumps (an
 * original map), or null. Luxels clipped by the LDR range or near black are ignored.
 */
export function measureHdrScale(bsp: BspFile, stride = 5): number | null {
  const ldr = bsp.lighting;
  const hdr = bsp.lightingHdr;
  const hdrFaces = bsp.facesHdr.length === bsp.faces.length ? bsp.facesHdr : bsp.faces;
  if (!ldr.length || !hdr.length) return null;
  const ratios: number[] = [];
  const a = [0, 0, 0];
  const b = [0, 0, 0];
  for (let i = 0; i < bsp.faces.length; i += stride) {
    const fl = bsp.faces[i];
    const fh = hdrFaces[i];
    if (fl.lightOfs < 0 || fh.lightOfs < 0) continue;
    const n = (fl.lightmapTextureSizeInLuxels[0] + 1) * (fl.lightmapTextureSizeInLuxels[1] + 1);
    for (let k = 0; k < n; k += 3) {
      if (fl.lightOfs + k * 4 + 4 > ldr.length || fh.lightOfs + k * 4 + 4 > hdr.length) break;
      decodeRgbe(ldr, fl.lightOfs + k * 4, a);
      decodeRgbe(hdr, fh.lightOfs + k * 4, b);
      const la = a[0] + a[1] + a[2];
      const lb = b[0] + b[1] + b[2];
      if (la > 0.05 && la < 2.5 && lb > 1e-4) ratios.push(la / lb);
    }
  }
  if (ratios.length < 16) return null;
  ratios.sort((x, y) => x - y);
  return ratios[ratios.length >> 1];
}

// --- packing -------------------------------------------------------------------------

export interface PackResult {
  width: number;
  height: number;
  /** Inner (unpadded) x, y per input rect; -1 when the rect is empty (w or h 0). */
  xy: Int32Array;
}

/**
 * Shelf-packs rectangles (w, h pairs, each padded by `pad` on every side) into the
 * smallest power-of-two atlas up to maxSize², tallest first. Returns null when
 * they do not fit.
 */
export function packRects(sizes: ArrayLike<number>, maxSize = 4096, pad = 1): PackResult | null {
  const n = sizes.length >> 1;
  const order: number[] = [];
  let area = 0;
  for (let i = 0; i < n; i++) {
    const w = sizes[i * 2];
    const h = sizes[i * 2 + 1];
    if (w <= 0 || h <= 0) continue;
    order.push(i);
    area += (w + pad * 2) * (h + pad * 2);
  }
  order.sort((a, b) => sizes[b * 2 + 1] - sizes[a * 2 + 1] || sizes[b * 2] - sizes[a * 2]);
  let best: PackResult | null = null;
  for (let width = 64; width <= maxSize; width *= 2) {
    if (width * maxSize < area) continue;
    const xy = new Int32Array(n * 2).fill(-1);
    let x = 0;
    let y = 0;
    let shelf = 0;
    let ok = true;
    for (const i of order) {
      const w = sizes[i * 2] + pad * 2;
      const h = sizes[i * 2 + 1] + pad * 2;
      if (w > width) {
        ok = false;
        break;
      }
      if (x + w > width) {
        y += shelf;
        x = 0;
        shelf = 0;
      }
      xy[i * 2] = x + pad;
      xy[i * 2 + 1] = y + pad;
      x += w;
      if (h > shelf) shelf = h;
    }
    const used = y + shelf;
    if (!ok || used > maxSize) continue;
    let height = 1;
    while (height < used) height *= 2;
    const better =
      !best ||
      width * height < best.width * best.height ||
      (width * height === best.width * best.height && Math.max(width, height) < Math.max(best.width, best.height));
    if (better) best = { width, height, xy };
  }
  return best;
}

// --- the atlas -----------------------------------------------------------------------

/** SURF_* flags read here. */
export const SURF_SKY2D = 0x2;
export const SURF_SKY = 0x4;
export const SURF_NOLIGHT = 0x400;
export const SURF_BUMPLIGHT = 0x800;
export const SURF_NODRAW = 0x80;

export interface LightmapAtlas {
  width: number;
  height: number;
  /** RGBA8, lineartolightmap-encoded (see module doc). */
  data: Uint8Array;
  /** Per face: inner x, y of its luxel block, or -1 (no lightmap: use `white`). */
  faceXY: Int32Array;
  /** Texel coordinates (not normalised) of a block centre whose light is 1.0. */
  white: [number, number];
  /** Luxels written (for stats). */
  luxels: number;
}

export interface LightmapAtlasOptions {
  /** Use the HDR lump (and the HDR face lump's offsets when present). */
  hdr: boolean;
  /** Multiplier on every luxel (HDR calibration). */
  scale?: number;
  maxSize?: number;
  /** Faces to include (default: every face with lightmap data). */
  include?: (faceIndex: number) => boolean;
}

/** The style-0 luxel block's byte offset of a face, or -1 (SDK: radial.cpp bump layout). */
export function faceStyle0Offset(face: BspFace, bumped: boolean): number {
  if (face.lightOfs < 0) return -1;
  const k = face.styles.indexOf(0);
  if (k < 0) return -1;
  const n = (face.lightmapTextureSizeInLuxels[0] + 1) * (face.lightmapTextureSizeInLuxels[1] + 1);
  return face.lightOfs + k * (bumped ? 4 : 1) * n * 4;
}

/** Builds the lightmap atlas of a BSP (style 0; bumped faces use their flat lightmap). */
export function buildLightmapAtlas(bsp: BspFile, opts: LightmapAtlasOptions): LightmapAtlas {
  const lighting = opts.hdr ? bsp.lightingHdr : bsp.lighting;
  const faces = opts.hdr && bsp.facesHdr.length === bsp.faces.length ? bsp.facesHdr : bsp.faces;
  const scale = opts.scale ?? 1;
  const nFaces = bsp.faces.length;
  const sizes = new Int32Array((nFaces + 1) * 2);
  const offsets = new Int32Array(nFaces).fill(-1);
  for (let i = 0; i < nFaces; i++) {
    const f = faces[i];
    const ti = bsp.texInfo[f.texInfo];
    if (!ti || ti.flags & (SURF_SKY | SURF_SKY2D | SURF_NODRAW)) continue;
    if (opts.include && !opts.include(i)) continue;
    const ofs = faceStyle0Offset(f, (ti.flags & SURF_BUMPLIGHT) !== 0);
    const w = f.lightmapTextureSizeInLuxels[0] + 1;
    const h = f.lightmapTextureSizeInLuxels[1] + 1;
    if (ofs < 0 || ofs + w * h * 4 > lighting.length) continue;
    offsets[i] = ofs;
    sizes[i * 2] = w;
    sizes[i * 2 + 1] = h;
  }
  // The white block (light 1.0) for lit materials on faces without a lightmap.
  sizes[nFaces * 2] = 2;
  sizes[nFaces * 2 + 1] = 2;
  const pack = packRects(sizes, opts.maxSize ?? 4096, 1);
  const width = pack?.width ?? 4;
  const height = pack?.height ?? 4;
  const data = new Uint8Array(width * height * 4);
  const faceXY = new Int32Array(nFaces * 2).fill(-1);
  const rgb = new Float32Array(3);
  let luxels = 0;
  const put = (x: number, y: number, r: number, g: number, b: number) => {
    const o = (y * width + x) * 4;
    data[o] = r;
    data[o + 1] = g;
    data[o + 2] = b;
    data[o + 3] = 255;
  };
  if (pack) {
    for (let i = 0; i < nFaces; i++) {
      const ofs = offsets[i];
      if (ofs < 0) continue;
      const x0 = pack.xy[i * 2];
      const y0 = pack.xy[i * 2 + 1];
      if (x0 < 0) continue;
      faceXY[i * 2] = x0;
      faceXY[i * 2 + 1] = y0;
      const w = sizes[i * 2];
      const h = sizes[i * 2 + 1];
      for (let t = 0; t < h; t++) {
        for (let s = 0; s < w; s++) {
          decodeRgbe(lighting, ofs + (t * w + s) * 4, rgb);
          put(
            x0 + s,
            y0 + t,
            linearToLightmap(rgb[0] * scale),
            linearToLightmap(rgb[1] * scale),
            linearToLightmap(rgb[2] * scale),
          );
        }
      }
      luxels += w * h;
      padBlock(data, width, x0, y0, w, h);
    }
  }
  const wx = pack ? pack.xy[nFaces * 2] : 1;
  const wy = pack ? pack.xy[nFaces * 2 + 1] : 1;
  const one = linearToLightmap(1);
  for (let t = -1; t <= 2; t++) for (let s = -1; s <= 2; s++) put(wx + s, wy + t, one, one, one);
  return { width, height, data, faceXY, white: [wx + 1, wy + 1], luxels };
}

/** Copies a block's edge texels into its 1-texel border (bilinear / MSAA bleed guard). */
function padBlock(data: Uint8Array, width: number, x0: number, y0: number, w: number, h: number): void {
  const copy = (sx: number, sy: number, dx: number, dy: number) => {
    const s = (sy * width + sx) * 4;
    const d = (dy * width + dx) * 4;
    data[d] = data[s];
    data[d + 1] = data[s + 1];
    data[d + 2] = data[s + 2];
    data[d + 3] = data[s + 3];
  };
  for (let s = 0; s < w; s++) {
    copy(x0 + s, y0, x0 + s, y0 - 1);
    copy(x0 + s, y0 + h - 1, x0 + s, y0 + h);
  }
  for (let t = -1; t <= h; t++) {
    copy(x0, y0 + t, x0 - 1, y0 + t);
    copy(x0 + w - 1, y0 + t, x0 + w, y0 + t);
  }
}
