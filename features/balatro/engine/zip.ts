/**
 * The smallest zip reader/writer the Balatro loader needs, on the browser's own
 * DecompressionStream / CompressionStream (no dependency).
 *
 * Reading: a LÖVE game ships as a zip, often *fused* — appended to the engine
 * executable (Balatro.exe on Windows). The central directory's offsets are
 * relative to where the zip starts, so the reader finds the end-of-central-
 * directory record from the back and works out how many bytes precede the zip.
 *
 * Writing: save exports are stored uncompressed (Balatro's .jkr files are
 * already deflated), so the writer only needs CRC-32 and the two headers.
 */

export interface ZipEntry {
  name: string;
  method: number; // 0 stored, 8 deflate
  compressedSize: number;
  size: number;
  /** Offset of the local file header, already shifted to the buffer. */
  headerOffset: number;
}

export interface ZipArchive {
  bytes: Uint8Array;
  /** Bytes before the zip (the engine executable, for a fused game). */
  prefix: number;
  entries: ZipEntry[];
}

const EOCD = 0x06054b50;
const CENTRAL = 0x02014b50;
const LOCAL = 0x04034b50;

function u16(b: Uint8Array, o: number): number {
  return b[o] | (b[o + 1] << 8);
}

function u32(b: Uint8Array, o: number): number {
  return (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;
}

const utf8 = new TextDecoder();

/** Parses a zip, or a fused executable with a zip on the end. Throws if neither. */
export function readZip(bytes: Uint8Array): ZipArchive {
  // The EOCD is 22 bytes plus an optional comment of up to 65535 bytes.
  const floor = Math.max(0, bytes.length - 22 - 0xffff);
  let eocd = -1;
  for (let i = bytes.length - 22; i >= floor; i--) {
    if (u32(bytes, i) === EOCD) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('not-a-zip');

  const count = u16(bytes, eocd + 10);
  const cdSize = u32(bytes, eocd + 12);
  const cdOffset = u32(bytes, eocd + 16);
  // Where the central directory really is, minus where the zip says it is.
  const prefix = eocd - cdSize - cdOffset;
  if (prefix < 0) throw new Error('not-a-zip');

  const entries: ZipEntry[] = [];
  let p = prefix + cdOffset;
  for (let i = 0; i < count; i++) {
    if (u32(bytes, p) !== CENTRAL) throw new Error('corrupt-zip');
    const method = u16(bytes, p + 10);
    const compressedSize = u32(bytes, p + 20);
    const size = u32(bytes, p + 24);
    const nameLen = u16(bytes, p + 28);
    const extraLen = u16(bytes, p + 30);
    const commentLen = u16(bytes, p + 32);
    const headerOffset = prefix + u32(bytes, p + 42);
    const name = utf8.decode(bytes.subarray(p + 46, p + 46 + nameLen));
    entries.push({ name, method, compressedSize, size, headerOffset });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return { bytes, prefix, entries };
}

async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** The uncompressed contents of one entry. */
export async function extractEntry(zip: ZipArchive, entry: ZipEntry): Promise<Uint8Array> {
  const b = zip.bytes;
  const h = entry.headerOffset;
  if (u32(b, h) !== LOCAL) throw new Error('corrupt-zip');
  const start = h + 30 + u16(b, h + 26) + u16(b, h + 28);
  const data = b.subarray(start, start + entry.compressedSize);
  if (entry.method === 0) return data;
  if (entry.method === 8) return inflateRaw(data);
  throw new Error(`unsupported-zip-method-${entry.method}`);
}

let crcTable: Uint32Array | null = null;

export function crc32(data: Uint8Array): number {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) crc = crcTable[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

/** A stored (uncompressed) zip of the given files. */
export function writeZip(files: { name: string; data: Uint8Array }[]): Uint8Array {
  const enc = new TextEncoder();
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;
  for (const file of files) {
    const name = enc.encode(file.name);
    const crc = crc32(file.data);
    const local = new Uint8Array(30 + name.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, LOCAL, true);
    lv.setUint16(4, 20, true);
    lv.setUint16(6, 0x0800, true); // UTF-8 names
    lv.setUint32(14, crc, true);
    lv.setUint32(18, file.data.length, true);
    lv.setUint32(22, file.data.length, true);
    lv.setUint16(26, name.length, true);
    local.set(name, 30);

    const central = new Uint8Array(46 + name.length);
    const cv = new DataView(central.buffer);
    cv.setUint32(0, CENTRAL, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(8, 0x0800, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, file.data.length, true);
    cv.setUint32(24, file.data.length, true);
    cv.setUint16(28, name.length, true);
    cv.setUint32(42, offset, true);
    central.set(name, 46);

    locals.push(local, file.data);
    centrals.push(central);
    offset += local.length + file.data.length;
  }
  const cdSize = centrals.reduce((n, c) => n + c.length, 0);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, EOCD, true);
  ev.setUint16(8, files.length, true);
  ev.setUint16(10, files.length, true);
  ev.setUint32(12, cdSize, true);
  ev.setUint32(16, offset, true);

  const out = new Uint8Array(offset + cdSize + 22);
  let p = 0;
  for (const part of [...locals, ...centrals, end]) {
    out.set(part, p);
    p += part.length;
  }
  return out;
}
