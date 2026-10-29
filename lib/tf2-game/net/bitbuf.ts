/**
 * Bit-level writer and reader for the game's binary protocol (the SDK's
 * bf_write / bf_read, tier1/bitbuf.cpp). Bits are packed least-significant
 * first within each byte, as Source does.
 *
 * Besides raw bits it carries the Source encodings the protocol needs:
 * LEB128-style varints (and zigzag for signed values), quantized floats,
 * 8/16-bit angles (WriteBitAngle), coordinates (WriteBitCoord: 1/32 unit, or
 * the multiplayer low-precision 1/8 variant), unit normals (WriteBitNormal)
 * and UTF-8 strings.
 *
 * The writer grows on demand; a `limit` (bytes) makes it report overflow
 * instead, which the snapshot encoder uses as its hard size cap. The reader
 * never throws while reading: past the end it returns zeros and sets
 * `overflowed`, and decoders check it once at the end (bf_read::IsOverflowed).
 *
 * Environment-agnostic, allocation-free in steady state.
 */

/** coordsize.h: COORD_INTEGER_BITS 14, COORD_FRACTIONAL_BITS 5. */
export const COORD_INTEGER_BITS = 14;
export const COORD_FRACTIONAL_BITS = 5;
/** COORD_FRACTIONAL_BITS_MP_LOWPRECISION (1/8 unit). */
export const COORD_FRACTIONAL_BITS_MP_LOWPRECISION = 3;
/** The largest magnitude a bit coord can carry (MAX_COORD_INTEGER). */
export const MAX_COORD = 1 << COORD_INTEGER_BITS;
/** NORMAL_FRACTIONAL_BITS. */
export const NORMAL_FRACTIONAL_BITS = 11;
const NORMAL_DENOMINATOR = (1 << NORMAL_FRACTIONAL_BITS) - 1;

const scratch = new DataView(new ArrayBuffer(8));
const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: false });

/** The value a coord write followed by a read produces (for canonical comparisons). */
export function quantizeCoord(v: number, fracBits = COORD_FRACTIONAL_BITS): number {
  if (!Number.isFinite(v)) return 0;
  const scale = 1 << fracBits;
  const max = MAX_COORD - 1 / scale;
  const c = v > max ? max : v < -max ? -max : v;
  const q = Math.round(Math.abs(c) * scale);
  const out = q / scale;
  return c < 0 && out !== 0 ? -out : out;
}

/** Normalizes degrees into [0, 360). */
export function angleMod(v: number): number {
  if (!Number.isFinite(v)) return 0;
  const r = v % 360;
  return r < 0 ? r + 360 : r;
}

/** The value an angle write of `bits` followed by a read produces, in (−180, 180]. */
export function quantizeAngle(v: number, bits: number): number {
  const n = 2 ** bits;
  const q = Math.round((angleMod(v) * n) / 360) % n;
  const deg = (q * 360) / n;
  return deg > 180 ? deg - 360 : deg;
}

export class BitWriter {
  private buf: Uint8Array;
  /** Bits written so far. */
  private bit = 0;
  /** Byte cap; writing past it sets `overflowed` and drops the bits. 0 = unlimited. */
  limit: number;
  overflowed = false;

  constructor(initialBytes = 256, limit = 0) {
    this.buf = new Uint8Array(Math.max(16, initialBytes));
    this.limit = limit;
  }

  /** Forget everything written (keeps the buffer). */
  reset(limit = this.limit): this {
    this.buf.fill(0, 0, (this.bit + 7) >> 3);
    this.bit = 0;
    this.limit = limit;
    this.overflowed = false;
    return this;
  }

  get bitLength(): number {
    return this.bit;
  }

  get byteLength(): number {
    return (this.bit + 7) >> 3;
  }

  /** Bits still available under the limit (Infinity without one). */
  get bitsLeft(): number {
    return this.limit > 0 ? this.limit * 8 - this.bit : Infinity;
  }

  /** A position to `rollback` to (bf_write has no such thing; the budgeter needs it). */
  mark(): number {
    return this.bit;
  }

  /** Discards everything written after `mark` and clears overflow. */
  rollback(mark: number): void {
    if (mark >= this.bit) return;
    const startByte = mark >> 3;
    const endByte = (this.bit + 7) >> 3;
    const keep = mark & 7;
    if (keep) this.buf[startByte] &= (1 << keep) - 1;
    else this.buf[startByte] = 0;
    this.buf.fill(0, startByte + 1, endByte);
    this.bit = mark;
    this.overflowed = false;
  }

  private ensure(bits: number): boolean {
    const need = this.bit + bits;
    if (this.limit > 0 && need > this.limit * 8) {
      this.overflowed = true;
      return false;
    }
    const bytes = (need + 7) >> 3;
    if (bytes > this.buf.length) {
      let size = this.buf.length * 2;
      while (size < bytes) size *= 2;
      const next = new Uint8Array(size);
      next.set(this.buf);
      this.buf = next;
    }
    return true;
  }

  /** Writes the low `n` bits (0…32) of `value`. */
  writeBits(value: number, n: number): void {
    if (n <= 0) return;
    if (this.overflowed || !this.ensure(n)) return;
    let v = n === 32 ? value >>> 0 : (value >>> 0) & (2 ** n - 1);
    let left = n;
    while (left > 0) {
      const byte = this.bit >> 3;
      const off = this.bit & 7;
      const take = Math.min(8 - off, left);
      this.buf[byte] |= (v & ((1 << take) - 1)) << off;
      v >>>= take;
      this.bit += take;
      left -= take;
    }
  }

  writeBit(b: boolean | number): void {
    this.writeBits(b ? 1 : 0, 1);
  }

  writeU8(v: number): void {
    this.writeBits(v & 0xff, 8);
  }

  writeU16(v: number): void {
    this.writeBits(v & 0xffff, 16);
  }

  writeU32(v: number): void {
    this.writeBits(v >>> 0, 32);
  }

  /** Unsigned varint: 7 bits per group, high bit = more (exact up to 2^53). */
  writeVarUint(v: number): void {
    let x = v > 0 && Number.isFinite(v) ? Math.floor(v) : 0;
    while (x >= 0x80) {
      this.writeBits((x % 0x80) | 0x80, 8);
      x = Math.floor(x / 0x80);
    }
    this.writeBits(x, 8);
  }

  /** Signed varint, zigzag-mapped (exact for |v| < 2^52). */
  writeVarInt(v: number): void {
    const x = Number.isFinite(v) ? Math.round(v) : 0;
    this.writeVarUint(x >= 0 ? x * 2 : -x * 2 - 1);
  }

  writeFloat32(v: number): void {
    scratch.setFloat32(0, v, true);
    this.writeBits(scratch.getUint32(0, true), 32);
  }

  writeFloat64(v: number): void {
    scratch.setFloat64(0, v, true);
    this.writeBits(scratch.getUint32(0, true), 32);
    this.writeBits(scratch.getUint32(4, true), 32);
  }

  /** `v` in [min, max] quantized to `bits` (SendPropFloat with nBits/low/high). */
  writeQuantized(v: number, min: number, max: number, bits: number): void {
    const steps = 2 ** bits - 1;
    const t = Number.isFinite(v) ? (v - min) / (max - min) : 0;
    const q = Math.round((t < 0 ? 0 : t > 1 ? 1 : t) * steps);
    this.writeBits(q, bits);
  }

  /** bf_write::WriteBitAngle: degrees into `bits` (8 or 16). */
  writeAngle(deg: number, bits: number): void {
    const n = 2 ** bits;
    this.writeBits(Math.round((angleMod(deg) * n) / 360) % n, bits);
  }

  /**
   * bf_write::WriteBitCoord: flags for an integer and a fractional part, a sign,
   * then (int − 1) in 14 bits and the fraction in `fracBits` (5 = 1/32 unit,
   * 3 = the MP low-precision 1/8). Clamped to ±16384.
   */
  writeCoord(v: number, fracBits = COORD_FRACTIONAL_BITS): void {
    const q = quantizeCoord(v, fracBits);
    const a = Math.abs(q);
    const scale = 1 << fracBits;
    const total = Math.round(a * scale);
    const intval = Math.floor(total / scale);
    const fractval = total - intval * scale;
    this.writeBit(intval !== 0);
    this.writeBit(fractval !== 0);
    if (intval || fractval) {
      this.writeBit(q < 0);
      if (intval) this.writeBits(intval - 1, COORD_INTEGER_BITS);
      if (fractval) this.writeBits(fractval, fracBits);
    }
  }

  /** bf_write::WriteBitNormal for one component in [−1, 1]. */
  writeNormalComponent(v: number): void {
    const c = Number.isFinite(v) ? Math.max(-1, Math.min(1, v)) : 0;
    this.writeBit(c < 0);
    this.writeBits(Math.round(Math.abs(c) * NORMAL_DENOMINATOR), NORMAL_FRACTIONAL_BITS);
  }

  /** bf_write::WriteBitVec3Normal: x and y, the sign of z (z is rebuilt). */
  writeNormal(x: number, y: number, z: number): void {
    const hasX = Math.abs(x) >= 1 / NORMAL_DENOMINATOR;
    const hasY = Math.abs(y) >= 1 / NORMAL_DENOMINATOR;
    this.writeBit(hasX);
    this.writeBit(hasY);
    if (hasX) this.writeNormalComponent(x);
    if (hasY) this.writeNormalComponent(y);
    this.writeBit(z < 0);
  }

  /** UTF-8 bytes with a varint length; longer strings are cut at `maxBytes`. */
  writeString(s: string, maxBytes = 1024): void {
    let bytes = encoder.encode(s);
    if (bytes.length > maxBytes) bytes = bytes.subarray(0, maxBytes);
    this.writeVarUint(bytes.length);
    this.writeByteArray(bytes);
  }

  writeByteArray(bytes: Uint8Array): void {
    if (!this.ensure(bytes.length * 8)) return;
    if ((this.bit & 7) === 0) {
      this.buf.set(bytes, this.bit >> 3);
      this.bit += bytes.length * 8;
      return;
    }
    for (let i = 0; i < bytes.length; i++) this.writeBits(bytes[i], 8);
  }

  /** Appends `bitLength` bits from another writer's output (or any packed buffer). */
  writeBitsFrom(src: Uint8Array, bitLength: number): void {
    if (bitLength <= 0) return;
    if (!this.ensure(bitLength)) return;
    if ((this.bit & 7) === 0 && (bitLength & 7) === 0) {
      this.buf.set(src.subarray(0, bitLength >> 3), this.bit >> 3);
      this.bit += bitLength;
      return;
    }
    let i = 0;
    for (; i + 32 <= bitLength; i += 32) {
      const b = i >> 3;
      this.writeBits(
        (src[b] | (src[b + 1] << 8) | (src[b + 2] << 16) | (src[b + 3] << 24)) >>> 0,
        32,
      );
    }
    for (; i + 8 <= bitLength; i += 8) this.writeBits(src[i >> 3], 8);
    const rest = bitLength - i;
    if (rest > 0) this.writeBits(src[i >> 3], rest);
  }

  /** The written bytes (a view; copy before reusing the writer). */
  view(): Uint8Array {
    return this.buf.subarray(0, this.byteLength);
  }

  /** A fresh copy of the written bytes with its own buffer (safe to transfer). */
  toBytes(): Uint8Array {
    return this.buf.slice(0, this.byteLength);
  }
}

export class BitReader {
  private readonly buf: Uint8Array;
  private bit = 0;
  private readonly end: number;
  overflowed = false;

  /** `bitLength` defaults to every bit of `buf`. */
  constructor(buf: Uint8Array, bitLength = buf.length * 8) {
    this.buf = buf;
    this.end = Math.min(bitLength, buf.length * 8);
  }

  get bitPosition(): number {
    return this.bit;
  }

  get bitsLeft(): number {
    return this.end - this.bit;
  }

  /** Reads `n` (0…32) bits as an unsigned number. */
  readBits(n: number): number {
    if (n <= 0) return 0;
    if (this.bit + n > this.end) {
      this.overflowed = true;
      this.bit = this.end;
      return 0;
    }
    let out = 0;
    let shift = 0;
    let left = n;
    while (left > 0) {
      const byte = this.buf[this.bit >> 3];
      const off = this.bit & 7;
      const take = Math.min(8 - off, left);
      const part = (byte >> off) & ((1 << take) - 1);
      out += part * 2 ** shift;
      shift += take;
      this.bit += take;
      left -= take;
    }
    return out;
  }

  readBit(): boolean {
    return this.readBits(1) === 1;
  }

  readU8(): number {
    return this.readBits(8);
  }

  readU16(): number {
    return this.readBits(16);
  }

  readU32(): number {
    return this.readBits(32);
  }

  readVarUint(): number {
    let out = 0;
    let mul = 1;
    for (let i = 0; i < 8; i++) {
      const b = this.readBits(8);
      out += (b & 0x7f) * mul;
      if ((b & 0x80) === 0) return out;
      mul *= 0x80;
    }
    this.overflowed = true;
    return out;
  }

  readVarInt(): number {
    const z = this.readVarUint();
    return z % 2 === 0 ? z / 2 : -(z + 1) / 2;
  }

  readFloat32(): number {
    scratch.setUint32(0, this.readBits(32), true);
    return scratch.getFloat32(0, true);
  }

  readFloat64(): number {
    const lo = this.readBits(32);
    const hi = this.readBits(32);
    scratch.setUint32(0, lo, true);
    scratch.setUint32(4, hi, true);
    return scratch.getFloat64(0, true);
  }

  readQuantized(min: number, max: number, bits: number): number {
    const steps = 2 ** bits - 1;
    return min + (this.readBits(bits) / steps) * (max - min);
  }

  /** Degrees in (−180, 180]. */
  readAngle(bits: number): number {
    const deg = (this.readBits(bits) * 360) / 2 ** bits;
    return deg > 180 ? deg - 360 : deg;
  }

  readCoord(fracBits = COORD_FRACTIONAL_BITS): number {
    const hasInt = this.readBit();
    const hasFrac = this.readBit();
    if (!hasInt && !hasFrac) return 0;
    const neg = this.readBit();
    const intval = hasInt ? this.readBits(COORD_INTEGER_BITS) + 1 : 0;
    const fractval = hasFrac ? this.readBits(fracBits) : 0;
    const v = intval + fractval / (1 << fracBits);
    return neg ? -v : v;
  }

  readNormalComponent(): number {
    const neg = this.readBit();
    const v = this.readBits(NORMAL_FRACTIONAL_BITS) / NORMAL_DENOMINATOR;
    return neg ? -v : v;
  }

  /** Writes the decoded unit vector into `out`. */
  readNormal(out: { x: number; y: number; z: number }): { x: number; y: number; z: number } {
    const hasX = this.readBit();
    const hasY = this.readBit();
    out.x = hasX ? this.readNormalComponent() : 0;
    out.y = hasY ? this.readNormalComponent() : 0;
    const negZ = this.readBit();
    const zz = 1 - out.x * out.x - out.y * out.y;
    out.z = zz > 0 ? Math.sqrt(zz) : 0;
    if (negZ) out.z = -out.z;
    return out;
  }

  readString(maxBytes = 1024): string {
    const len = this.readVarUint();
    if (len > maxBytes || len * 8 > this.bitsLeft) {
      this.overflowed = true;
      this.bit = this.end;
      return '';
    }
    return decoder.decode(this.readByteArray(len));
  }

  readByteArray(len: number): Uint8Array {
    const out = new Uint8Array(len);
    if (len * 8 > this.bitsLeft) {
      this.overflowed = true;
      this.bit = this.end;
      return out;
    }
    if ((this.bit & 7) === 0) {
      out.set(this.buf.subarray(this.bit >> 3, (this.bit >> 3) + len));
      this.bit += len * 8;
      return out;
    }
    for (let i = 0; i < len; i++) out[i] = this.readBits(8);
    return out;
  }
}
