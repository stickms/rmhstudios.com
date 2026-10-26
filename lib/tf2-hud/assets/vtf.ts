/**
 * Valve Texture Format (VTF) decoder — the highest-resolution mip of frame 0 as
 * RGBA8888. HUD textures ship as VTF, so this is what lets a user who imports
 * their own `tf/` files see the real artwork instead of a placeholder.
 *
 * Supports the formats HUD materials actually use: DXT1/3/5, the 8-bit-per-
 * channel layouts, 565 and the greyscale ones. Anything else returns `null` and
 * the preview falls back to a placeholder rather than failing.
 */

export interface DecodedImage {
  width: number;
  height: number;
  /** RGBA, row-major, top row first. */
  data: Uint8ClampedArray;
  /** Animation frames in the file (the decoded one is `frame`). */
  frames: number;
  frame: number;
}

const FORMAT = {
  RGBA8888: 0,
  ABGR8888: 1,
  RGB888: 2,
  BGR888: 3,
  RGB565: 4,
  I8: 5,
  IA88: 6,
  A8: 8,
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
} as const;

/** Bytes per pixel for the non-block formats; 0 for block-compressed. */
function bytesPerPixel(fmt: number): number {
  switch (fmt) {
    case FORMAT.RGBA8888:
    case FORMAT.ABGR8888:
    case FORMAT.ARGB8888:
    case FORMAT.BGRA8888:
    case FORMAT.BGRX8888:
      return 4;
    case FORMAT.RGB888:
    case FORMAT.BGR888:
      return 3;
    case FORMAT.RGB565:
    case FORMAT.BGR565:
    case FORMAT.BGRX5551:
    case FORMAT.BGRA4444:
    case FORMAT.BGRA5551:
    case FORMAT.IA88:
    case FORMAT.UV88:
      return 2;
    case FORMAT.I8:
    case FORMAT.A8:
      return 1;
    default:
      return 0;
  }
}

function imageSize(fmt: number, w: number, h: number): number {
  if (fmt === FORMAT.DXT1 || fmt === FORMAT.DXT1_ONEBITALPHA) {
    return Math.max(1, Math.ceil(w / 4)) * Math.max(1, Math.ceil(h / 4)) * 8;
  }
  if (fmt === FORMAT.DXT3 || fmt === FORMAT.DXT5) {
    return Math.max(1, Math.ceil(w / 4)) * Math.max(1, Math.ceil(h / 4)) * 16;
  }
  return w * h * bytesPerPixel(fmt);
}

function rgb565(v: number): [number, number, number] {
  return [
    ((v >> 11) & 31) * 8 + ((v >> 11) & 31) / 4,
    ((v >> 5) & 63) * 4 + ((v >> 5) & 63) / 16,
    (v & 31) * 8 + (v & 31) / 4,
  ];
}

function decodeBlocks(
  src: Uint8Array,
  offset: number,
  w: number,
  h: number,
  fmt: number,
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(w * h * 4);
  const bw = Math.ceil(w / 4);
  const bh = Math.ceil(h / 4);
  const isDxt1 = fmt === FORMAT.DXT1 || fmt === FORMAT.DXT1_ONEBITALPHA;
  const blockBytes = isDxt1 ? 8 : 16;
  const colors = new Uint8ClampedArray(16);
  for (let by = 0; by < bh; by++) {
    for (let bx = 0; bx < bw; bx++) {
      const b = offset + (by * bw + bx) * blockBytes;
      const cOff = isDxt1 ? b : b + 8;
      const c0 = src[cOff] | (src[cOff + 1] << 8);
      const c1 = src[cOff + 2] | (src[cOff + 3] << 8);
      const [r0, g0, b0] = rgb565(c0);
      const [r1, g1, b1] = rgb565(c1);
      colors.set([r0, g0, b0, 255, r1, g1, b1, 255]);
      if (c0 > c1 || !isDxt1) {
        colors.set([(2 * r0 + r1) / 3, (2 * g0 + g1) / 3, (2 * b0 + b1) / 3, 255], 8);
        colors.set([(r0 + 2 * r1) / 3, (g0 + 2 * g1) / 3, (b0 + 2 * b1) / 3, 255], 12);
      } else {
        colors.set([(r0 + r1) / 2, (g0 + g1) / 2, (b0 + b1) / 2, 255], 8);
        colors.set([0, 0, 0, 0], 12);
      }
      const bits =
        src[cOff + 4] | (src[cOff + 5] << 8) | (src[cOff + 6] << 16) | (src[cOff + 7] << 24);

      let alpha: number[] | undefined;
      if (fmt === FORMAT.DXT5) {
        const a0 = src[b];
        const a1 = src[b + 1];
        const table = [a0, a1];
        if (a0 > a1) for (let i = 1; i <= 6; i++) table.push(((7 - i) * a0 + i * a1) / 7);
        else {
          for (let i = 1; i <= 4; i++) table.push(((5 - i) * a0 + i * a1) / 5);
          table.push(0, 255);
        }
        alpha = [];
        // 48 bits of 3-bit indices, little endian.
        let lo = src[b + 2] | (src[b + 3] << 8) | (src[b + 4] << 16);
        let hi = src[b + 5] | (src[b + 6] << 8) | (src[b + 7] << 16);
        for (let i = 0; i < 8; i++) {
          alpha.push(table[lo & 7]);
          lo >>= 3;
        }
        for (let i = 0; i < 8; i++) {
          alpha.push(table[hi & 7]);
          hi >>= 3;
        }
      } else if (fmt === FORMAT.DXT3) {
        alpha = [];
        for (let i = 0; i < 16; i++) {
          const byte = src[b + (i >> 1)];
          const nib = i & 1 ? byte >> 4 : byte & 15;
          alpha.push(nib * 17);
        }
      }

      for (let py = 0; py < 4; py++) {
        for (let px = 0; px < 4; px++) {
          const x = bx * 4 + px;
          const y = by * 4 + py;
          if (x >= w || y >= h) continue;
          const i = py * 4 + px;
          const ci = ((bits >> (2 * i)) & 3) * 4;
          const o = (y * w + x) * 4;
          out[o] = colors[ci];
          out[o + 1] = colors[ci + 1];
          out[o + 2] = colors[ci + 2];
          out[o + 3] = alpha ? alpha[i] : colors[ci + 3];
        }
      }
    }
  }
  return out;
}

function decodeRaw(
  src: Uint8Array,
  offset: number,
  w: number,
  h: number,
  fmt: number,
): Uint8ClampedArray | null {
  const bpp = bytesPerPixel(fmt);
  const out = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    const s = offset + i * bpp;
    const o = i * 4;
    switch (fmt) {
      case FORMAT.RGBA8888:
        out.set([src[s], src[s + 1], src[s + 2], src[s + 3]], o);
        break;
      case FORMAT.ABGR8888:
        out.set([src[s + 3], src[s + 2], src[s + 1], src[s]], o);
        break;
      case FORMAT.ARGB8888:
        out.set([src[s + 1], src[s + 2], src[s + 3], src[s]], o);
        break;
      case FORMAT.BGRA8888:
        out.set([src[s + 2], src[s + 1], src[s], src[s + 3]], o);
        break;
      case FORMAT.BGRX8888:
        out.set([src[s + 2], src[s + 1], src[s], 255], o);
        break;
      case FORMAT.RGB888:
        out.set([src[s], src[s + 1], src[s + 2], 255], o);
        break;
      case FORMAT.BGR888:
        out.set([src[s + 2], src[s + 1], src[s], 255], o);
        break;
      case FORMAT.RGB565: {
        const [r, g, b] = rgb565(src[s] | (src[s + 1] << 8));
        out.set([r, g, b, 255], o);
        break;
      }
      case FORMAT.I8:
        out.set([src[s], src[s], src[s], 255], o);
        break;
      case FORMAT.A8:
        out.set([255, 255, 255, src[s]], o);
        break;
      case FORMAT.BGR565: {
        const v = src[s] | (src[s + 1] << 8);
        const [b, g, r] = rgb565(v);
        out.set([r, g, b, 255], o);
        break;
      }
      case FORMAT.BGRX5551:
      case FORMAT.BGRA5551: {
        const v = src[s] | (src[s + 1] << 8);
        const e5 = (n: number) => (n << 3) | (n >> 2);
        out.set(
          [
            e5((v >> 10) & 31),
            e5((v >> 5) & 31),
            e5(v & 31),
            fmt === FORMAT.BGRA5551 && !(v & 0x8000) ? 0 : 255,
          ],
          o,
        );
        break;
      }
      case FORMAT.BGRA4444: {
        const v = src[s] | (src[s + 1] << 8);
        out.set(
          [((v >> 8) & 15) * 17, ((v >> 4) & 15) * 17, (v & 15) * 17, ((v >> 12) & 15) * 17],
          o,
        );
        break;
      }
      case FORMAT.UV88:
        // Normal-map style two-channel data: shown as red/green so it is at least inspectable.
        out.set([src[s], src[s + 1], 128, 255], o);
        break;
      case FORMAT.IA88:
        out.set([src[s], src[s], src[s], src[s + 1]], o);
        break;
      default:
        return null;
    }
  }
  return out;
}

export interface VtfOptions {
  /** Animation frame to decode (clamped to the file's range). Default 0. */
  frame?: number;
}

export function decodeVtf(bytes: Uint8Array, opts: VtfOptions = {}): DecodedImage | null {
  if (bytes.length < 64) return null;
  if (bytes[0] !== 0x56 || bytes[1] !== 0x54 || bytes[2] !== 0x46 || bytes[3] !== 0) return null;
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const minor = v.getUint32(8, true);
  const headerSize = v.getUint32(12, true);
  const width = v.getUint16(16, true);
  const height = v.getUint16(18, true);
  const frames = Math.max(1, v.getUint16(24, true));
  const hiFormat = v.getInt32(52, true);
  const mips = Math.max(1, v.getUint8(56));
  const lowFormat = v.getInt32(57, true);
  const lowW = v.getUint8(61);
  const lowH = v.getUint8(62);
  if (width === 0 || height === 0 || width > 8192 || height > 8192) return null;
  if (hiFormat < 0) return null;
  const frame = Math.max(0, Math.min(frames - 1, Math.floor(opts.frame ?? 0)));

  // Where the image data starts. 7.3+ lists it as a resource entry (tag 0x30); older files put it
  // right after the header and the low-resolution thumbnail. Either way the mips follow
  // smallest-first, each holding every frame, so the top mip is reached by skipping the rest.
  let dataStart: number | undefined;
  if (minor >= 3 && bytes.length >= 80) {
    const count = v.getUint32(68, true);
    for (let i = 0; i < Math.min(count, 32); i++) {
      const at = 80 + i * 8;
      if (at + 8 > bytes.length) break;
      if (bytes[at] === 0x30 && bytes[at + 1] === 0 && bytes[at + 2] === 0) {
        dataStart = v.getUint32(at + 4, true);
        break;
      }
    }
  }
  if (dataStart === undefined) {
    dataStart = headerSize;
    if (lowFormat >= 0 && lowW && lowH) dataStart += imageSize(lowFormat, lowW, lowH);
  }
  let offset = dataStart;
  for (let m = mips - 1; m >= 1; m--) {
    const mw = Math.max(1, width >> m);
    const mh = Math.max(1, height >> m);
    offset += imageSize(hiFormat, mw, mh) * frames;
  }
  const need = imageSize(hiFormat, width, height);
  offset += need * frame;
  if (need === 0 || offset + need > bytes.length) return null;

  const data =
    hiFormat === FORMAT.DXT1 ||
    hiFormat === FORMAT.DXT1_ONEBITALPHA ||
    hiFormat === FORMAT.DXT3 ||
    hiFormat === FORMAT.DXT5
      ? decodeBlocks(bytes, offset, width, height, hiFormat)
      : decodeRaw(bytes, offset, width, height, hiFormat);
  return data ? { width, height, data, frames, frame } : null;
}
