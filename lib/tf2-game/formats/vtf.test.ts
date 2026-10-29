import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseBsp, openPakfile } from './bsp';
import {
  decodeImage,
  decodeVtf,
  decodeVtfLowRes,
  IMAGE_FORMAT,
  imageSize,
  parseVtfHeader,
  TEXTUREFLAGS,
} from './vtf';
import { readMap } from './tf2-root.test-support';

const SDK_LOGO =
  '/home/user/valvesoftware/source-sdk-2013/game/mod_tf/materials/logo/new_tf2_logo.vtf';
const logoPath = process.env.SOURCE_SDK_ROOT
  ? path.join(process.env.SOURCE_SDK_ROOT, 'game/mod_tf/materials/logo/new_tf2_logo.vtf')
  : SDK_LOGO;

interface VtfSpec {
  minor: number;
  width: number;
  height: number;
  format: number;
  mips: number;
  frames?: number;
  flags?: number;
  /** Image data, smallest mip first (as stored). */
  data: number[];
}

/** Writes a VTF 7.x file: 7.0–7.2 with data after the header, 7.3+ with an image resource. */
function buildVtf(s: VtfSpec): Uint8Array {
  const headerSize = s.minor >= 3 ? 80 + 2 * 8 : 80;
  const out = new Uint8Array(headerSize + s.data.length);
  const v = new DataView(out.buffer);
  out.set([0x56, 0x54, 0x46, 0]);
  v.setInt32(4, 7, true);
  v.setInt32(8, s.minor, true);
  v.setInt32(12, headerSize, true);
  v.setUint16(16, s.width, true);
  v.setUint16(18, s.height, true);
  v.setUint32(20, s.flags ?? 0, true);
  v.setUint16(24, s.frames ?? 1, true);
  v.setUint16(26, 0, true);
  v.setFloat32(48, 1, true);
  v.setInt32(52, s.format, true);
  v.setUint8(56, s.mips);
  v.setInt32(57, -1, true); // no low-res image
  v.setUint8(61, 0);
  v.setUint8(62, 0);
  if (s.minor >= 2) v.setUint16(63, 1, true);
  if (s.minor >= 3) {
    v.setUint32(68, 2, true);
    // CRC resource (no data chunk), then the image resource.
    out.set([0x43, 0x52, 0x43, 0x02], 80);
    v.setUint32(84, 0x1234, true);
    out.set([0x30, 0, 0, 0], 88);
    v.setUint32(92, headerSize, true);
  }
  out.set(s.data, headerSize);
  return out;
}

const px = (img: { rgba: Uint8Array; width: number }, x: number, y: number) => [
  ...img.rgba.subarray((y * img.width + x) * 4, (y * img.width + x) * 4 + 4),
];

describe('vtf pixel formats', () => {
  it('decodes uncompressed formats to RGBA8', () => {
    const one = (format: number, bytes: number[]) => [
      ...decodeImage(new Uint8Array(bytes), format, 1, 1),
    ];
    expect(one(IMAGE_FORMAT.RGBA8888, [1, 2, 3, 4])).toEqual([1, 2, 3, 4]);
    expect(one(IMAGE_FORMAT.ABGR8888, [4, 3, 2, 1])).toEqual([1, 2, 3, 4]);
    expect(one(IMAGE_FORMAT.ARGB8888, [4, 1, 2, 3])).toEqual([1, 2, 3, 4]);
    expect(one(IMAGE_FORMAT.BGRA8888, [3, 2, 1, 4])).toEqual([1, 2, 3, 4]);
    expect(one(IMAGE_FORMAT.BGRX8888, [3, 2, 1, 0])).toEqual([1, 2, 3, 255]);
    expect(one(IMAGE_FORMAT.RGB888, [1, 2, 3])).toEqual([1, 2, 3, 255]);
    expect(one(IMAGE_FORMAT.BGR888, [3, 2, 1])).toEqual([1, 2, 3, 255]);
    expect(one(IMAGE_FORMAT.I8, [77])).toEqual([77, 77, 77, 255]);
    expect(one(IMAGE_FORMAT.IA88, [77, 9])).toEqual([77, 77, 77, 9]);
    expect(one(IMAGE_FORMAT.A8, [9])).toEqual([0, 0, 0, 9]);
    // BGR565: red in the top 5 bits.
    expect(one(IMAGE_FORMAT.BGR565, [0x00, 0xf8])).toEqual([255, 0, 0, 255]);
    expect(one(IMAGE_FORMAT.BGR565, [0x1f, 0x00])).toEqual([0, 0, 255, 255]);
    // BGRA4444: b g r a nibbles from the low bits.
    expect(one(IMAGE_FORMAT.BGRA4444, [0x21, 0x43])).toEqual([0x33, 0x22, 0x11, 0x44]);
    // BGRA5551: alpha bit on top.
    expect(one(IMAGE_FORMAT.BGRA5551, [0x1f, 0x80])).toEqual([0, 0, 255, 255]);
    expect(one(IMAGE_FORMAT.BGRA5551, [0x00, 0x7c])).toEqual([255, 0, 0, 0]);
    // UV88: zero offset → straight-up normal.
    expect(one(IMAGE_FORMAT.UV88, [0, 0])).toEqual([128, 128, 255, 255]);
    // RGBA16161616F: 1.0, 0.5, 0, 1.0 (half floats) → sRGB 255, 188, 0, alpha 255.
    expect(
      one(IMAGE_FORMAT.RGBA16161616F, [0x00, 0x3c, 0x00, 0x38, 0x00, 0x00, 0x00, 0x3c]),
    ).toEqual([255, 188, 0, 255]);
  });

  it('decodes DXT1 (with 1-bit alpha), DXT3 and DXT5 blocks', () => {
    // c0 = red, c1 = blue, c0 > c1: 4-colour mode. Row 0 indices 0,1,2,3.
    const dxt1 = [0x00, 0xf8, 0x1f, 0x00, 0b11100100, 0, 0, 0];
    const a = { rgba: decodeImage(new Uint8Array(dxt1), IMAGE_FORMAT.DXT1, 4, 4), width: 4 };
    expect(px(a, 0, 0)).toEqual([255, 0, 0, 255]);
    expect(px(a, 1, 0)).toEqual([0, 0, 255, 255]);
    expect(px(a, 2, 0)).toEqual([170, 0, 85, 255]);
    expect(px(a, 3, 0)).toEqual([85, 0, 170, 255]);
    // c0 <= c1: 3-colour mode, index 3 is transparent black.
    const dxt1a = [0x1f, 0x00, 0x00, 0xf8, 0b11000000, 0, 0, 0];
    const b = {
      rgba: decodeImage(new Uint8Array(dxt1a), IMAGE_FORMAT.DXT1_ONEBITALPHA, 4, 4),
      width: 4,
    };
    expect(px(b, 3, 0)).toEqual([0, 0, 0, 0]);
    expect(px(b, 0, 1)).toEqual([0, 0, 255, 255]);
    // DXT3: explicit 4-bit alpha (first pixel 0xF → 255, second 0x8 → 136).
    const dxt3 = [0x8f, 0, 0, 0, 0, 0, 0, 0, ...dxt1];
    const c = { rgba: decodeImage(new Uint8Array(dxt3), IMAGE_FORMAT.DXT3, 4, 4), width: 4 };
    expect(px(c, 0, 0)).toEqual([255, 0, 0, 255]);
    expect(px(c, 1, 0)[3]).toBe(136);
    expect(px(c, 2, 0)[3]).toBe(0);
    // DXT5: a0 = 255, a1 = 0; pixel 0 index 0 (255), pixel 1 index 1 (0), pixel 2 index 2 (6/7·255 + …).
    const dxt5 = [255, 0, 0b10_001_000, 0, 0, 0, 0, 0, ...dxt1];
    const d = { rgba: decodeImage(new Uint8Array(dxt5), IMAGE_FORMAT.DXT5, 4, 4), width: 4 };
    expect(px(d, 0, 0)[3]).toBe(255);
    expect(px(d, 1, 0)[3]).toBe(0);
    expect(px(d, 2, 0)[3]).toBe(219);
    // Non-multiple-of-4 sizes clip the block.
    expect(decodeImage(new Uint8Array(dxt1), IMAGE_FORMAT.DXT1, 2, 1)).toHaveLength(8);
  });

  it('sizes images per format', () => {
    expect(imageSize(IMAGE_FORMAT.DXT1, 1, 1)).toBe(8);
    expect(imageSize(IMAGE_FORMAT.DXT5, 8, 4)).toBe(32);
    expect(imageSize(IMAGE_FORMAT.BGR888, 4, 4)).toBe(48);
  });
});

describe('vtf files', () => {
  it('reads 7.2 mip chains (smallest first) and frames', () => {
    // 2×2 RGBA8888, 2 mips, 2 frames: mip1 (1×1) f0, f1, then mip0 (2×2) f0, f1.
    const mip1 = [
      [1, 1, 1, 1],
      [2, 2, 2, 2],
    ];
    const mip0 = [Array(16).fill(10), Array(16).fill(20)];
    const vtf = buildVtf({
      minor: 2,
      width: 2,
      height: 2,
      format: IMAGE_FORMAT.RGBA8888,
      mips: 2,
      frames: 2,
      data: [...mip1[0], ...mip1[1], ...mip0[0], ...mip0[1]],
    });
    const h = parseVtfHeader(vtf);
    expect(h.version).toEqual([7, 2]);
    expect(h.faces).toBe(1);
    expect(px(decodeVtf(vtf), 1, 1)).toEqual([10, 10, 10, 10]);
    expect(px(decodeVtf(vtf, { frame: 1 }), 0, 0)).toEqual([20, 20, 20, 20]);
    const small = decodeVtf(vtf, { mip: 1, frame: 1 });
    expect([small.width, small.height]).toEqual([1, 1]);
    expect(px(small, 0, 0)).toEqual([2, 2, 2, 2]);
    expect(decodeVtfLowRes(vtf)).toBeNull();
  });

  it('reads 7.3+ resources and cubemap faces', () => {
    const faceData = (v: number) => Array(4).fill(v);
    const vtf = buildVtf({
      minor: 5,
      width: 1,
      height: 1,
      format: IMAGE_FORMAT.RGBA8888,
      mips: 1,
      flags: TEXTUREFLAGS.ENVMAP,
      data: [0, 1, 2, 3, 4, 5].flatMap((f) => faceData(f * 10)),
    });
    const h = parseVtfHeader(vtf);
    expect(h.resources.map((r) => r.tag)).toEqual(['CRC', '0x30']);
    expect(h.faces).toBe(6);
    expect(px(decodeVtf(vtf, { face: 4 }), 0, 0)).toEqual([40, 40, 40, 40]);
  });

  it('rejects non-VTF data', () => {
    expect(() => parseVtfHeader(new Uint8Array(128))).toThrow();
  });

  it.skipIf(!existsSync(logoPath))('decodes the SDK TF2 logo (DXT5, 7.4)', () => {
    const img = decodeVtf(new Uint8Array(readFileSync(logoPath)));
    expect(img.header.version).toEqual([7, 4]);
    expect(img.header.imageFormat).toBe(IMAGE_FORMAT.DXT5);
    expect([img.width, img.height]).toEqual([2048, 512]);
    // The logo has opaque lettering and transparent surroundings.
    let opaque = 0;
    let clear = 0;
    let bright = 0;
    for (let i = 0; i < img.rgba.length; i += 4) {
      if (img.rgba[i + 3] > 240) opaque++;
      if (img.rgba[i + 3] < 16) clear++;
      if (
        img.rgba[i] > 200 &&
        img.rgba[i + 1] > 200 &&
        img.rgba[i + 2] > 200 &&
        img.rgba[i + 3] > 240
      )
        bright++;
    }
    const n = img.width * img.height;
    expect(opaque / n).toBeGreaterThan(0.2);
    expect(clear / n).toBeGreaterThan(0.05);
    expect(bright).toBeGreaterThan(1000); // white "TEAM FORTRESS" letters
    const low = decodeVtfLowRes(new Uint8Array(readFileSync(logoPath)));
    expect(low && low.width).toBeGreaterThan(0);
    const mip3 = decodeVtf(new Uint8Array(readFileSync(logoPath)), { mip: 3 });
    expect([mip3.width, mip3.height]).toEqual([256, 64]);
  });
});

describe.skipIf(!process.env.TF2_ROOT)('vtf (TF2_ROOT pakfile cubemaps)', () => {
  it('decodes every VTF in the ctf_2fort pakfile (DXT1 + RGBA16161616F cubemaps)', () => {
    const pak = openPakfile(parseBsp(readMap('ctf_2fort')));
    const vtfs = pak.list('', 'vtf');
    expect(vtfs.length).toBeGreaterThan(10);
    const formats = new Set<number>();
    for (const p of vtfs) {
      const img = decodeVtf(pak.read(p)!);
      formats.add(img.header.imageFormat);
      expect(img.rgba.length).toBe(img.width * img.height * 4);
      if (img.header.flags & TEXTUREFLAGS.ENVMAP)
        expect(img.header.faces).toBeGreaterThanOrEqual(6);
    }
    expect(formats.has(IMAGE_FORMAT.RGBA16161616F) || formats.has(IMAGE_FORMAT.DXT1)).toBe(true);
  });
});
