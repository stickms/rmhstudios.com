/**
 * Reader for the BSP pakfile lump (LUMP_PAKFILE, 40): a zip archive holding
 * the map's embedded materials, cubemaps, soundscapes and so on. Valve writes
 * entries stored (method 0) or LZMA-compressed (method 14, the zip LZMA
 * flavour: u8 major, u8 minor, u16 propsSize, props[5], raw stream).
 * SDK: CZipFile / CZipPackFile (public/zip_utils.h, ZIP_* structs in zip_uncompressed.h).
 */

import { readCString, viewOf } from './binary';
import { lzmaDecodeRaw } from './lzma';
import { normalizeGamePath } from './vpk';

const SIG_EOCD = 0x06054b50;
const SIG_CENTRAL = 0x02014b50;
const SIG_LOCAL = 0x04034b50;

export const ZIP_METHOD_STORED = 0;
export const ZIP_METHOD_DEFLATE = 8;
export const ZIP_METHOD_LZMA = 14;

export interface ZipEntry {
  /** Normalized path (lowercase, forward slashes). */
  path: string;
  /** Name as stored. */
  rawName: string;
  method: number;
  crc: number;
  compressedSize: number;
  size: number;
  localHeaderOffset: number;
}

export class ZipArchive {
  readonly bytes: Uint8Array;
  readonly entries: Map<string, ZipEntry>;

  constructor(bytes: Uint8Array, entries: Map<string, ZipEntry>) {
    this.bytes = bytes;
    this.entries = entries;
  }

  /** Every entry path, optionally filtered by prefix and extension. */
  list(prefix = '', ext?: string): string[] {
    const pre = normalizeGamePath(prefix);
    const e = ext ? '.' + ext.replace(/^\./, '').toLowerCase() : null;
    const out: string[] = [];
    for (const p of this.entries.keys()) {
      if (pre && !p.startsWith(pre)) continue;
      if (e && !p.endsWith(e)) continue;
      out.push(p);
    }
    return out;
  }

  has(path: string): boolean {
    return this.entries.has(normalizeGamePath(path));
  }

  /** Reads and (if needed) decompresses an entry; null when absent. */
  read(path: string): Uint8Array | null {
    const e = this.entries.get(normalizeGamePath(path));
    if (!e) return null;
    const view = viewOf(this.bytes);
    const lh = e.localHeaderOffset;
    if (view.getUint32(lh, true) !== SIG_LOCAL)
      throw new Error(`zip: bad local header for ${e.path}`);
    const nameLen = view.getUint16(lh + 26, true);
    const extraLen = view.getUint16(lh + 28, true);
    const start = lh + 30 + nameLen + extraLen;
    const data = this.bytes.subarray(start, start + e.compressedSize);
    if (e.method === ZIP_METHOD_STORED) return data;
    if (e.method === ZIP_METHOD_LZMA) {
      // zip LZMA: version (2 bytes), properties size (u16), properties, stream.
      const propsSize = data[2] | (data[3] << 8);
      const props = data.subarray(4, 4 + propsSize);
      return lzmaDecodeRaw(data, 4 + propsSize, props, e.size);
    }
    throw new Error(`zip: unsupported compression method ${e.method} for ${e.path}`);
  }
}

/** Parses a zip from its end-of-central-directory record. */
export function parseZip(bytes: Uint8Array): ZipArchive {
  const view = viewOf(bytes);
  // EOCD is 22 bytes plus a comment of up to 65535 bytes.
  let eocd = -1;
  const minPos = Math.max(0, bytes.length - 22 - 0xffff);
  for (let i = bytes.length - 22; i >= minPos; i--) {
    if (view.getUint32(i, true) === SIG_EOCD) {
      eocd = i;
      break;
    }
  }
  const entries = new Map<string, ZipEntry>();
  if (eocd < 0) {
    if (bytes.length === 0) return new ZipArchive(bytes, entries);
    throw new Error('zip: end of central directory not found');
  }
  const count = view.getUint16(eocd + 10, true);
  let p = view.getUint32(eocd + 16, true);
  for (let i = 0; i < count; i++) {
    if (view.getUint32(p, true) !== SIG_CENTRAL)
      throw new Error('zip: bad central directory entry');
    const method = view.getUint16(p + 10, true);
    const crc = view.getUint32(p + 16, true);
    const compressedSize = view.getUint32(p + 20, true);
    const size = view.getUint32(p + 24, true);
    const nameLen = view.getUint16(p + 28, true);
    const extraLen = view.getUint16(p + 30, true);
    const commentLen = view.getUint16(p + 32, true);
    const localHeaderOffset = view.getUint32(p + 42, true);
    const rawName = readCString(bytes, p + 46, nameLen);
    p += 46 + nameLen + extraLen + commentLen;
    if (rawName.endsWith('/')) continue; // directory entry
    const path = normalizeGamePath(rawName);
    entries.set(path, { path, rawName, method, crc, compressedSize, size, localHeaderOffset });
  }
  return new ZipArchive(bytes, entries);
}
