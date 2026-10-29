/**
 * Little-endian binary reading over a `Uint8Array`. Every Valve format the
 * game reads (BSP, VPK, VTF, MDL, PHY) is little-endian with C struct layout,
 * so the readers here are thin wrappers over a DataView with a cursor.
 */

const textDecoder = new TextDecoder('latin1');

/** A DataView over exactly the bytes of `bytes` (respecting its byteOffset). */
export function viewOf(bytes: Uint8Array): DataView {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

/** Decodes a NUL-terminated (or length-bounded) Latin-1 string. */
export function readCString(
  bytes: Uint8Array,
  offset: number,
  maxLength = bytes.length - offset,
): string {
  let end = offset;
  const limit = Math.min(bytes.length, offset + maxLength);
  while (end < limit && bytes[end] !== 0) end++;
  return textDecoder.decode(bytes.subarray(offset, end));
}

/** Decodes bytes as Latin-1 text (Valve text formats are ASCII / Windows-1252). */
export function decodeText(bytes: Uint8Array): string {
  // UTF-8 BOM / UTF-16 are rare in game files; strip a UTF-8 BOM if present.
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return new TextDecoder('utf-8').decode(bytes.subarray(3));
  }
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    return new TextDecoder('utf-16le').decode(bytes.subarray(2));
  }
  return textDecoder.decode(bytes);
}

/** Four-CC as a little-endian u32 ('VBSP' → 0x50534256). */
export function fourCC(s: string): number {
  return (
    (s.charCodeAt(0) |
      (s.charCodeAt(1) << 8) |
      (s.charCodeAt(2) << 16) |
      (s.charCodeAt(3) << 24)) >>>
    0
  );
}

/** Inverse of fourCC. */
export function fourCCString(v: number): string {
  return String.fromCharCode(v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff);
}

/**
 * A cursor-based little-endian reader. `offset` is relative to the start of
 * `bytes`; `seek`/`skip` move it. Reads past the end throw a RangeError (from
 * DataView), which callers treat as a corrupt file.
 */
export class BinaryReader {
  readonly bytes: Uint8Array;
  readonly view: DataView;
  offset: number;

  constructor(bytes: Uint8Array, offset = 0) {
    this.bytes = bytes;
    this.view = viewOf(bytes);
    this.offset = offset;
  }

  get length(): number {
    return this.bytes.length;
  }

  get remaining(): number {
    return this.bytes.length - this.offset;
  }

  seek(offset: number): this {
    this.offset = offset;
    return this;
  }

  skip(n: number): this {
    this.offset += n;
    return this;
  }

  u8(): number {
    return this.view.getUint8(this.offset++);
  }

  i8(): number {
    return this.view.getInt8(this.offset++);
  }

  u16(): number {
    const v = this.view.getUint16(this.offset, true);
    this.offset += 2;
    return v;
  }

  i16(): number {
    const v = this.view.getInt16(this.offset, true);
    this.offset += 2;
    return v;
  }

  u32(): number {
    const v = this.view.getUint32(this.offset, true);
    this.offset += 4;
    return v;
  }

  i32(): number {
    const v = this.view.getInt32(this.offset, true);
    this.offset += 4;
    return v;
  }

  f32(): number {
    const v = this.view.getFloat32(this.offset, true);
    this.offset += 4;
    return v;
  }

  f64(): number {
    const v = this.view.getFloat64(this.offset, true);
    this.offset += 8;
    return v;
  }

  /** Reads `n` bytes as a view (no copy). */
  bytesView(n: number): Uint8Array {
    if (this.offset + n > this.bytes.length) throw new RangeError('read past end');
    const v = this.bytes.subarray(this.offset, this.offset + n);
    this.offset += n;
    return v;
  }

  /** A NUL-terminated string; advances past the terminator. */
  cstring(): string {
    const start = this.offset;
    let end = start;
    const b = this.bytes;
    while (end < b.length && b[end] !== 0) end++;
    this.offset = Math.min(end + 1, b.length);
    return textDecoder.decode(b.subarray(start, end));
  }

  /** A fixed-size, NUL-padded string field (e.g. char name[64]). */
  fixedString(size: number): string {
    const s = readCString(this.bytes, this.offset, size);
    this.offset += size;
    return s;
  }

  /** Three floats (a Vector). */
  vec3(): { x: number; y: number; z: number } {
    const x = this.f32();
    const y = this.f32();
    const z = this.f32();
    return { x, y, z };
  }
}

/** Copies `count` little-endian f32 values starting at `offset` into a new Float32Array. */
export function readF32Array(bytes: Uint8Array, offset: number, count: number): Float32Array {
  const out = new Float32Array(count);
  const view = viewOf(bytes);
  for (let i = 0; i < count; i++) out[i] = view.getFloat32(offset + i * 4, true);
  return out;
}

/** Copies `count` little-endian i32 values. */
export function readI32Array(bytes: Uint8Array, offset: number, count: number): Int32Array {
  const out = new Int32Array(count);
  const view = viewOf(bytes);
  for (let i = 0; i < count; i++) out[i] = view.getInt32(offset + i * 4, true);
  return out;
}

/** Copies `count` little-endian u16 values. */
export function readU16Array(bytes: Uint8Array, offset: number, count: number): Uint16Array {
  const out = new Uint16Array(count);
  const view = viewOf(bytes);
  for (let i = 0; i < count; i++) out[i] = view.getUint16(offset + i * 2, true);
  return out;
}
