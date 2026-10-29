/**
 * VTF (Valve Texture Format) 7.0–7.5: header, resources, and decoding one
 * mip / frame / face / slice to RGBA8. Layout per public/vtf/vtf.h
 * (VTFFileHeader_t, packed to 1 byte; ResourceEntryInfo) and the image formats
 * of public/bitmap/imageformat.h.
 *
 * High-res data is stored smallest mip first; within a mip: frames, then
 * faces, then depth slices.
 */

import { viewOf } from './binary';

export const IMAGE_FORMAT = {
  RGBA8888: 0,
  ABGR8888: 1,
  RGB888: 2,
  BGR888: 3,
  RGB565: 4,
  I8: 5,
  IA88: 6,
  P8: 7,
  A8: 8,
  RGB888_BLUESCREEN: 9,
  BGR888_BLUESCREEN: 10,
  ARGB8888: 11,
  BGRA8888: 12,
  DXT1: 13,
  DXT3: 14,
  DXT5: 15,
  BGRX8888: 16,
  BGR565: 17,
  BGRX5551: 18,
  BGRA4444: 19,
  DXT1_ONEBITALPHA: 20,
  BGRA5551: 21,
  UV88: 22,
  UVWQ8888: 23,
  RGBA16161616F: 24,
  RGBA16161616: 25,
  UVLX8888: 26,
  R32F: 27,
  RGB323232F: 28,
  RGBA32323232F: 29,
} as const;

export const TEXTUREFLAGS = {
  POINTSAMPLE: 0x1,
  TRILINEAR: 0x2,
  CLAMPS: 0x4,
  CLAMPT: 0x8,
  ANISOTROPIC: 0x10,
  HINT_DXT5: 0x20,
  SRGB: 0x40,
  NORMAL: 0x80,
  NOMIP: 0x100,
  NOLOD: 0x200,
  ALL_MIPS: 0x400,
  PROCEDURAL: 0x800,
  ONEBITALPHA: 0x1000,
  EIGHTBITALPHA: 0x2000,
  ENVMAP: 0x4000,
  RENDERTARGET: 0x8000,
  CLAMPU: 0x2000000,
  SSBUMP: 0x8000000,
  BORDER: 0x20000000,
} as const;

const RSRC_LOW_RES_IMAGE = 0x01;
const RSRC_IMAGE = 0x30;
const RSRCF_HAS_NO_DATA_CHUNK = 0x02;

export interface VtfResource {
  /** 3-byte tag as a number (e.g. 0x30 for the image, or 'CRC' bytes). */
  type: number;
  /** Tag as text where printable ("CRC", "LOD", "TSO") or hex. */
  tag: string;
  flags: number;
  /** Offset into the file, or the inline value when flags has RSRCF_HAS_NO_DATA_CHUNK. */
  data: number;
}

export interface VtfHeader {
  version: [number, number];
  headerSize: number;
  width: number;
  height: number;
  flags: number;
  numFrames: number;
  startFrame: number;
  reflectivity: [number, number, number];
  bumpScale: number;
  imageFormat: number;
  numMipLevels: number;
  lowResImageFormat: number;
  lowResImageWidth: number;
  lowResImageHeight: number;
  depth: number;
  resources: VtfResource[];
  /** Number of faces: 1, or 6 for a cubemap (7 for pre-7.5 cubemaps with a sphere map). */
  faces: number;
  /** Byte offset of the high-res image data. */
  imageDataOffset: number;
  lowResDataOffset: number;
}

export interface VtfImage {
  width: number;
  height: number;
  /** RGBA8, row-major, top row first. */
  rgba: Uint8Array;
}

/** Bytes for one w×h×1 image in this format (SDK: ImageLoader::GetMemRequired). */
export function imageSize(format: number, w: number, h: number): number {
  switch (format) {
    case IMAGE_FORMAT.DXT1:
    case IMAGE_FORMAT.DXT1_ONEBITALPHA:
      return Math.max(1, (w + 3) >> 2) * Math.max(1, (h + 3) >> 2) * 8;
    case IMAGE_FORMAT.DXT3:
    case IMAGE_FORMAT.DXT5:
      return Math.max(1, (w + 3) >> 2) * Math.max(1, (h + 3) >> 2) * 16;
    default:
      return w * h * bytesPerPixel(format);
  }
}

export function bytesPerPixel(format: number): number {
  switch (format) {
    case IMAGE_FORMAT.RGBA8888:
    case IMAGE_FORMAT.ABGR8888:
    case IMAGE_FORMAT.ARGB8888:
    case IMAGE_FORMAT.BGRA8888:
    case IMAGE_FORMAT.BGRX8888:
    case IMAGE_FORMAT.UVWQ8888:
    case IMAGE_FORMAT.UVLX8888:
    case IMAGE_FORMAT.R32F:
      return 4;
    case IMAGE_FORMAT.RGB888:
    case IMAGE_FORMAT.BGR888:
    case IMAGE_FORMAT.RGB888_BLUESCREEN:
    case IMAGE_FORMAT.BGR888_BLUESCREEN:
      return 3;
    case IMAGE_FORMAT.RGB565:
    case IMAGE_FORMAT.BGR565:
    case IMAGE_FORMAT.BGRX5551:
    case IMAGE_FORMAT.BGRA5551:
    case IMAGE_FORMAT.BGRA4444:
    case IMAGE_FORMAT.IA88:
    case IMAGE_FORMAT.UV88:
      return 2;
    case IMAGE_FORMAT.I8:
    case IMAGE_FORMAT.A8:
    case IMAGE_FORMAT.P8:
      return 1;
    case IMAGE_FORMAT.RGBA16161616F:
    case IMAGE_FORMAT.RGBA16161616:
      return 8;
    case IMAGE_FORMAT.RGB323232F:
      return 12;
    case IMAGE_FORMAT.RGBA32323232F:
      return 16;
    default:
      return 0;
  }
}

const mipDim = (d: number, mip: number): number => Math.max(1, d >> mip);

/** Parses the VTF header (and 7.3+ resource directory). */
export function parseVtfHeader(bytes: Uint8Array): VtfHeader {
  const view = viewOf(bytes);
  if (
    bytes.length < 64 ||
    bytes[0] !== 0x56 ||
    bytes[1] !== 0x54 ||
    bytes[2] !== 0x46 ||
    bytes[3] !== 0
  ) {
    throw new Error('vtf: bad signature');
  }
  const major = view.getInt32(4, true);
  const minor = view.getInt32(8, true);
  if (major !== 7 || minor < 0 || minor > 5)
    throw new Error(`vtf: unsupported version ${major}.${minor}`);
  const headerSize = view.getInt32(12, true);
  const width = view.getUint16(16, true);
  const height = view.getUint16(18, true);
  const flags = view.getUint32(20, true);
  const numFrames = Math.max(1, view.getUint16(24, true));
  const startFrame = view.getUint16(26, true);
  const reflectivity: [number, number, number] = [
    view.getFloat32(32, true),
    view.getFloat32(36, true),
    view.getFloat32(40, true),
  ];
  const bumpScale = view.getFloat32(48, true);
  const imageFormat = view.getInt32(52, true);
  const numMipLevels = view.getUint8(56);
  const lowResImageFormat = view.getInt32(57, true);
  const lowResImageWidth = view.getUint8(61);
  const lowResImageHeight = view.getUint8(62);
  const depth = minor >= 2 ? Math.max(1, view.getUint16(63, true)) : 1;

  // SDK: CVTFTexture face count — envmaps have 6 faces, plus a sphere map before 7.5.
  let faces = 1;
  if (flags & TEXTUREFLAGS.ENVMAP) faces = minor < 5 && startFrame !== 0xffff ? 7 : 6;

  const resources: VtfResource[] = [];
  let imageDataOffset = -1;
  let lowResDataOffset = -1;
  if (minor >= 3) {
    const numResources = view.getUint32(68, true);
    for (let i = 0; i < numResources; i++) {
      const o = 80 + i * 8;
      if (o + 8 > bytes.length) break;
      const type = bytes[o] | (bytes[o + 1] << 8) | (bytes[o + 2] << 16);
      const rflags = bytes[o + 3];
      const data = view.getUint32(o + 4, true);
      const tagBytes = [bytes[o], bytes[o + 1], bytes[o + 2]];
      const printable = tagBytes.every((c) => c >= 0x20 && c < 0x7f);
      const tag = printable ? String.fromCharCode(...tagBytes) : '0x' + type.toString(16);
      resources.push({ type, tag, flags: rflags, data });
      if (!(rflags & RSRCF_HAS_NO_DATA_CHUNK)) {
        if (type === RSRC_IMAGE) imageDataOffset = data;
        else if (type === RSRC_LOW_RES_IMAGE) lowResDataOffset = data;
      }
    }
  }
  if (imageDataOffset < 0) {
    // 7.0–7.2 (or 7.3+ without an image resource): low-res thumbnail follows the header.
    lowResDataOffset = headerSize;
    const lowResSize =
      lowResImageFormat >= 0 && lowResImageWidth > 0 && lowResImageHeight > 0
        ? imageSize(lowResImageFormat, lowResImageWidth, lowResImageHeight)
        : 0;
    imageDataOffset = headerSize + lowResSize;
  }

  return {
    version: [major, minor],
    headerSize,
    width,
    height,
    flags,
    numFrames,
    startFrame,
    reflectivity,
    bumpScale,
    imageFormat,
    numMipLevels,
    lowResImageFormat,
    lowResImageWidth,
    lowResImageHeight,
    depth,
    resources,
    faces,
    imageDataOffset,
    lowResDataOffset,
  };
}

/** Byte offset of (mip, frame, face, slice) in the file. */
export function vtfImageOffset(h: VtfHeader, mip: number, frame = 0, face = 0, slice = 0): number {
  let off = h.imageDataOffset;
  // Smaller mips come first.
  for (let m = h.numMipLevels - 1; m > mip; m--) {
    const w = mipDim(h.width, m);
    const hh = mipDim(h.height, m);
    const d = mipDim(h.depth, m);
    off += imageSize(h.imageFormat, w, hh) * d * h.faces * h.numFrames;
  }
  const w = mipDim(h.width, mip);
  const hh = mipDim(h.height, mip);
  const d = mipDim(h.depth, mip);
  const one = imageSize(h.imageFormat, w, hh);
  off += one * ((frame * h.faces + face) * d + slice);
  return off;
}

export interface VtfDecodeOptions {
  /** Mip level (0 = largest). Clamped to the available range. */
  mip?: number;
  frame?: number;
  face?: number;
  slice?: number;
}

/** Decodes one image of a VTF to RGBA8. */
export function decodeVtf(
  bytes: Uint8Array,
  options: VtfDecodeOptions = {},
): VtfImage & { header: VtfHeader } {
  const header = parseVtfHeader(bytes);
  const mip = Math.min(Math.max(0, options.mip ?? 0), Math.max(0, header.numMipLevels - 1));
  const frame = Math.min(options.frame ?? 0, header.numFrames - 1);
  const face = Math.min(options.face ?? 0, header.faces - 1);
  const slice = Math.min(options.slice ?? 0, header.depth - 1);
  const w = mipDim(header.width, mip);
  const h = mipDim(header.height, mip);
  const off = vtfImageOffset(header, mip, frame, face, slice);
  const size = imageSize(header.imageFormat, w, h);
  if (off < 0 || off + size > bytes.length) throw new Error('vtf: image data out of range');
  const rgba = decodeImage(bytes.subarray(off, off + size), header.imageFormat, w, h);
  return { width: w, height: h, rgba, header };
}

/** Decodes the low-resolution thumbnail (usually DXT1), or null. */
export function decodeVtfLowRes(bytes: Uint8Array): VtfImage | null {
  const h = parseVtfHeader(bytes);
  if (
    h.lowResDataOffset < 0 ||
    h.lowResImageFormat < 0 ||
    !h.lowResImageWidth ||
    !h.lowResImageHeight
  )
    return null;
  const size = imageSize(h.lowResImageFormat, h.lowResImageWidth, h.lowResImageHeight);
  const src = bytes.subarray(h.lowResDataOffset, h.lowResDataOffset + size);
  return {
    width: h.lowResImageWidth,
    height: h.lowResImageHeight,
    rgba: decodeImage(src, h.lowResImageFormat, h.lowResImageWidth, h.lowResImageHeight),
  };
}

// --- pixel decoders ---------------------------------------------------------

function halfToFloat(h: number): number {
  const s = h & 0x8000 ? -1 : 1;
  const e = (h >> 10) & 0x1f;
  const f = h & 0x3ff;
  if (e === 0) return s * f * 2 ** -24;
  if (e === 31) return f ? NaN : s * Infinity;
  return s * (1 + f / 1024) * 2 ** (e - 15);
}

/** Linear HDR → 8-bit sRGB (clamped). */
function tonemap(v: number): number {
  if (!(v > 0)) return 0;
  if (v >= 1) return 255;
  const s = v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
  return Math.round(s * 255);
}

function rgb565(c: number, out: Uint8Array, o: number): void {
  const r = (c >> 11) & 0x1f;
  const g = (c >> 5) & 0x3f;
  const b = c & 0x1f;
  out[o] = (r << 3) | (r >> 2);
  out[o + 1] = (g << 2) | (g >> 4);
  out[o + 2] = (b << 3) | (b >> 2);
}

/** Decodes a DXT colour block into a 16-entry RGBA palette index set. */
function decodeDxtColorBlock(
  src: Uint8Array,
  so: number,
  out: Uint8Array,
  w: number,
  h: number,
  bx: number,
  by: number,
  dxt1: boolean,
): void {
  const c0 = src[so] | (src[so + 1] << 8);
  const c1 = src[so + 2] | (src[so + 3] << 8);
  const pal = new Uint8Array(16);
  rgb565(c0, pal, 0);
  rgb565(c1, pal, 4);
  pal[3] = pal[7] = 255;
  if (!dxt1 || c0 > c1) {
    for (let k = 0; k < 3; k++) {
      pal[8 + k] = ((2 * pal[k] + pal[4 + k] + 1) / 3) | 0;
      pal[12 + k] = ((pal[k] + 2 * pal[4 + k] + 1) / 3) | 0;
    }
    pal[11] = pal[15] = 255;
  } else {
    for (let k = 0; k < 3; k++) {
      pal[8 + k] = (pal[k] + pal[4 + k]) >> 1;
      pal[12 + k] = 0;
    }
    pal[11] = 255;
    pal[15] = 0; // 1-bit alpha: transparent black
  }
  const bits = (src[so + 4] | (src[so + 5] << 8) | (src[so + 6] << 16) | (src[so + 7] << 24)) >>> 0;
  for (let py = 0; py < 4; py++) {
    const y = by * 4 + py;
    if (y >= h) break;
    for (let px = 0; px < 4; px++) {
      const x = bx * 4 + px;
      if (x >= w) continue;
      const idx = (bits >>> (2 * (py * 4 + px))) & 3;
      const o = (y * w + x) * 4;
      out[o] = pal[idx * 4];
      out[o + 1] = pal[idx * 4 + 1];
      out[o + 2] = pal[idx * 4 + 2];
      out[o + 3] = pal[idx * 4 + 3];
    }
  }
}

function decodeDxt(src: Uint8Array, w: number, h: number, kind: 1 | 3 | 5): Uint8Array {
  const out = new Uint8Array(w * h * 4);
  const bw = Math.max(1, (w + 3) >> 2);
  const bh = Math.max(1, (h + 3) >> 2);
  const blockSize = kind === 1 ? 8 : 16;
  const alpha = new Uint8Array(16);
  for (let by = 0; by < bh; by++) {
    for (let bx = 0; bx < bw; bx++) {
      const so = (by * bw + bx) * blockSize;
      if (kind === 1) {
        decodeDxtColorBlock(src, so, out, w, h, bx, by, true);
        continue;
      }
      decodeDxtColorBlock(src, so + 8, out, w, h, bx, by, false);
      if (kind === 3) {
        for (let i = 0; i < 16; i++) {
          const nib = (src[so + (i >> 1)] >> ((i & 1) * 4)) & 0xf;
          alpha[i] = nib * 17;
        }
      } else {
        const a0 = src[so];
        const a1 = src[so + 1];
        const pal = [a0, a1, 0, 0, 0, 0, 0, 0];
        if (a0 > a1) {
          for (let k = 1; k <= 6; k++) pal[k + 1] = (((7 - k) * a0 + k * a1 + 3) / 7) | 0;
        } else {
          for (let k = 1; k <= 4; k++) pal[k + 1] = (((5 - k) * a0 + k * a1 + 2) / 5) | 0;
          pal[6] = 0;
          pal[7] = 255;
        }
        // 48 bits of 3-bit indices.
        let lo = (src[so + 2] | (src[so + 3] << 8) | (src[so + 4] << 16)) >>> 0;
        let hi = (src[so + 5] | (src[so + 6] << 8) | (src[so + 7] << 16)) >>> 0;
        for (let i = 0; i < 8; i++) {
          alpha[i] = pal[lo & 7];
          lo >>>= 3;
        }
        for (let i = 8; i < 16; i++) {
          alpha[i] = pal[hi & 7];
          hi >>>= 3;
        }
      }
      for (let py = 0; py < 4; py++) {
        const y = by * 4 + py;
        if (y >= h) break;
        for (let px = 0; px < 4; px++) {
          const x = bx * 4 + px;
          if (x >= w) continue;
          out[(y * w + x) * 4 + 3] = alpha[py * 4 + px];
        }
      }
    }
  }
  return out;
}

/** Decodes raw pixels of one image to RGBA8. Throws on unsupported formats. */
export function decodeImage(src: Uint8Array, format: number, w: number, h: number): Uint8Array {
  const F = IMAGE_FORMAT;
  if (format === F.DXT1 || format === F.DXT1_ONEBITALPHA) return decodeDxt(src, w, h, 1);
  if (format === F.DXT3) return decodeDxt(src, w, h, 3);
  if (format === F.DXT5) return decodeDxt(src, w, h, 5);

  const n = w * h;
  const out = new Uint8Array(n * 4);
  const bpp = bytesPerPixel(format);
  if (src.length < n * bpp) throw new Error('vtf: truncated image data');
  for (let i = 0; i < n; i++) {
    const s = i * bpp;
    const o = i * 4;
    switch (format) {
      case F.RGBA8888:
      case F.UVWQ8888:
      case F.UVLX8888:
        out[o] = src[s];
        out[o + 1] = src[s + 1];
        out[o + 2] = src[s + 2];
        out[o + 3] = src[s + 3];
        break;
      case F.ABGR8888:
        out[o] = src[s + 3];
        out[o + 1] = src[s + 2];
        out[o + 2] = src[s + 1];
        out[o + 3] = src[s];
        break;
      case F.ARGB8888:
        // Memory order A, R, G, B.
        out[o] = src[s + 1];
        out[o + 1] = src[s + 2];
        out[o + 2] = src[s + 3];
        out[o + 3] = src[s];
        break;
      case F.BGRA8888:
        out[o] = src[s + 2];
        out[o + 1] = src[s + 1];
        out[o + 2] = src[s];
        out[o + 3] = src[s + 3];
        break;
      case F.BGRX8888:
        out[o] = src[s + 2];
        out[o + 1] = src[s + 1];
        out[o + 2] = src[s];
        out[o + 3] = 255;
        break;
      case F.RGB888:
        out[o] = src[s];
        out[o + 1] = src[s + 1];
        out[o + 2] = src[s + 2];
        out[o + 3] = 255;
        break;
      case F.RGB888_BLUESCREEN: {
        const blue = src[s] === 0 && src[s + 1] === 0 && src[s + 2] === 255;
        out[o] = blue ? 0 : src[s];
        out[o + 1] = blue ? 0 : src[s + 1];
        out[o + 2] = blue ? 0 : src[s + 2];
        out[o + 3] = blue ? 0 : 255;
        break;
      }
      case F.BGR888:
        out[o] = src[s + 2];
        out[o + 1] = src[s + 1];
        out[o + 2] = src[s];
        out[o + 3] = 255;
        break;
      case F.BGR888_BLUESCREEN: {
        const blue = src[s] === 255 && src[s + 1] === 0 && src[s + 2] === 0;
        out[o] = blue ? 0 : src[s + 2];
        out[o + 1] = blue ? 0 : src[s + 1];
        out[o + 2] = blue ? 0 : src[s];
        out[o + 3] = blue ? 0 : 255;
        break;
      }
      case F.RGB565: {
        // R in the low bits for RGB565 (Valve's naming is MSB→LSB for BGR565).
        const c = src[s] | (src[s + 1] << 8);
        const b = (c >> 11) & 0x1f;
        const g = (c >> 5) & 0x3f;
        const r = c & 0x1f;
        out[o] = (r << 3) | (r >> 2);
        out[o + 1] = (g << 2) | (g >> 4);
        out[o + 2] = (b << 3) | (b >> 2);
        out[o + 3] = 255;
        break;
      }
      case F.BGR565:
        rgb565(src[s] | (src[s + 1] << 8), out, o);
        out[o + 3] = 255;
        break;
      case F.BGRA5551:
      case F.BGRX5551: {
        const c = src[s] | (src[s + 1] << 8);
        const b = c & 0x1f;
        const g = (c >> 5) & 0x1f;
        const r = (c >> 10) & 0x1f;
        out[o] = (r << 3) | (r >> 2);
        out[o + 1] = (g << 3) | (g >> 2);
        out[o + 2] = (b << 3) | (b >> 2);
        out[o + 3] = format === F.BGRX5551 ? 255 : c & 0x8000 ? 255 : 0;
        break;
      }
      case F.BGRA4444: {
        const c = src[s] | (src[s + 1] << 8);
        out[o + 2] = (c & 0xf) * 17;
        out[o + 1] = ((c >> 4) & 0xf) * 17;
        out[o] = ((c >> 8) & 0xf) * 17;
        out[o + 3] = ((c >> 12) & 0xf) * 17;
        break;
      }
      case F.I8:
        out[o] = out[o + 1] = out[o + 2] = src[s];
        out[o + 3] = 255;
        break;
      case F.IA88:
        out[o] = out[o + 1] = out[o + 2] = src[s];
        out[o + 3] = src[s + 1];
        break;
      case F.A8:
        out[o] = out[o + 1] = out[o + 2] = 0;
        out[o + 3] = src[s];
        break;
      case F.UV88: {
        // Signed du/dv → a normal-map style RGB (z reconstructed).
        const u = ((src[s] << 24) >> 24) / 127;
        const v = ((src[s + 1] << 24) >> 24) / 127;
        const z = Math.sqrt(Math.max(0, 1 - u * u - v * v));
        out[o] = Math.round((u * 0.5 + 0.5) * 255);
        out[o + 1] = Math.round((v * 0.5 + 0.5) * 255);
        out[o + 2] = Math.round((z * 0.5 + 0.5) * 255);
        out[o + 3] = 255;
        break;
      }
      case F.RGBA16161616F: {
        const view = viewOf(src);
        out[o] = tonemap(halfToFloat(view.getUint16(s, true)));
        out[o + 1] = tonemap(halfToFloat(view.getUint16(s + 2, true)));
        out[o + 2] = tonemap(halfToFloat(view.getUint16(s + 4, true)));
        out[o + 3] = Math.round(
          Math.min(1, Math.max(0, halfToFloat(view.getUint16(s + 6, true)))) * 255,
        );
        break;
      }
      case F.RGBA16161616: {
        out[o] = src[s + 1];
        out[o + 1] = src[s + 3];
        out[o + 2] = src[s + 5];
        out[o + 3] = src[s + 7];
        break;
      }
      default:
        throw new Error(`vtf: unsupported image format ${format}`);
    }
  }
  return out;
}
