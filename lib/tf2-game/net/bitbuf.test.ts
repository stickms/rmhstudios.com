/**
 * The bit buffer: every encoding round-trips at its documented precision,
 * unaligned bit copies, rollback, the byte cap, and a reader that never reads
 * past the end.
 */
import { describe, expect, it } from 'vitest';
import { UniformRandomStream } from '../core/random';
import {
  BitReader,
  BitWriter,
  COORD_FRACTIONAL_BITS_MP_LOWPRECISION,
  quantizeAngle,
  quantizeCoord,
} from './bitbuf';

describe('BitWriter / BitReader', () => {
  it('round-trips raw bits of every width, unaligned', () => {
    const rng = new UniformRandomStream(5);
    const w = new BitWriter(8);
    const values: Array<[number, number]> = [];
    for (let i = 0; i < 2000; i++) {
      const n = rng.randomInt(1, 32);
      const v =
        n === 32
          ? (rng.randomInt(0, 0x7fffffff) * 2 + rng.randomInt(0, 1)) >>> 0
          : rng.randomInt(0, 2 ** Math.min(n, 30) - 1);
      values.push([v, n]);
      w.writeBits(v, n);
    }
    const r = new BitReader(w.view(), w.bitLength);
    for (const [v, n] of values) expect(r.readBits(n)).toBe(v);
    expect(r.overflowed).toBe(false);
    expect(r.bitsLeft).toBe(0);
  });

  it('varints: unsigned up to 2^53 and zigzag signed', () => {
    const w = new BitWriter();
    const us = [
      0,
      1,
      127,
      128,
      255,
      16383,
      16384,
      2 ** 31,
      2 ** 32 - 1,
      2 ** 40 + 3,
      Number.MAX_SAFE_INTEGER,
    ];
    const ss = [0, -1, 1, -64, 63, -65, 2 ** 31 - 1, -(2 ** 31), 2 ** 45, -(2 ** 45)];
    w.writeBit(true); // misalign
    for (const v of us) w.writeVarUint(v);
    for (const v of ss) w.writeVarInt(v);
    const r = new BitReader(w.view());
    r.readBit();
    for (const v of us) expect(r.readVarUint()).toBe(v);
    for (const v of ss) expect(r.readVarInt()).toBe(v);
    // Small values are one byte.
    const one = new BitWriter();
    one.writeVarUint(100);
    expect(one.byteLength).toBe(1);
  });

  it('floats, quantized floats, angles', () => {
    const w = new BitWriter();
    w.writeBits(5, 3);
    w.writeFloat32(1.1);
    w.writeFloat64(Math.PI);
    w.writeQuantized(0.3, 0, 1, 10);
    w.writeAngle(-90, 8);
    w.writeAngle(359.99, 16);
    w.writeAngle(123.456, 16);
    const r = new BitReader(w.view());
    expect(r.readBits(3)).toBe(5);
    expect(r.readFloat32()).toBe(Math.fround(1.1));
    expect(r.readFloat64()).toBe(Math.PI);
    expect(r.readQuantized(0, 1, 10)).toBeCloseTo(0.3, 3);
    expect(r.readAngle(8)).toBeCloseTo(-90, 6);
    expect(r.readAngle(16)).toBeCloseTo(quantizeAngle(359.99, 16), 9);
    const a = r.readAngle(16);
    expect(Math.abs(a - 123.456)).toBeLessThanOrEqual(360 / 65536);
    expect(a).toBe(quantizeAngle(123.456, 16));
  });

  it('coords at 1/32 (bitcoord) and 1/8 (MP low precision), clamped to ±16384', () => {
    const rng = new UniformRandomStream(9);
    const vals = [0, 0.01, -0.01, 1, -1, 0.5, 15.97, -4095.25, 16383.9, 20000, -20000];
    for (let i = 0; i < 500; i++) vals.push(rng.randomFloat(-16000, 16000));
    const w = new BitWriter();
    for (const v of vals) w.writeCoord(v);
    for (const v of vals) w.writeCoord(v, COORD_FRACTIONAL_BITS_MP_LOWPRECISION);
    const r = new BitReader(w.view());
    for (const v of vals) {
      const d = r.readCoord();
      expect(d).toBe(quantizeCoord(v));
      if (Math.abs(v) < 16383) expect(Math.abs(d - v)).toBeLessThanOrEqual(1 / 64 + 1e-9);
    }
    for (const v of vals) {
      const d = r.readCoord(COORD_FRACTIONAL_BITS_MP_LOWPRECISION);
      expect(d).toBe(quantizeCoord(v, COORD_FRACTIONAL_BITS_MP_LOWPRECISION));
      if (Math.abs(v) < 16383) expect(Math.abs(d - v)).toBeLessThanOrEqual(1 / 16 + 1e-9);
    }
    // A zero coord is two bits.
    const z = new BitWriter();
    z.writeCoord(0);
    expect(z.bitLength).toBe(2);
  });

  it('unit normals within 1/2047 per component', () => {
    const rng = new UniformRandomStream(3);
    const w = new BitWriter();
    const ns: Array<[number, number, number]> = [];
    for (let i = 0; i < 200; i++) {
      const x = rng.randomFloat(-1, 1);
      const y = rng.randomFloat(-1, 1);
      const z = rng.randomFloat(-1, 1);
      const l = Math.hypot(x, y, z) || 1;
      ns.push([x / l, y / l, z / l]);
      w.writeNormal(x / l, y / l, z / l);
    }
    const r = new BitReader(w.view());
    const out = { x: 0, y: 0, z: 0 };
    for (const [x, y, z] of ns) {
      r.readNormal(out);
      expect(Math.abs(out.x - x)).toBeLessThan(1e-3);
      expect(Math.abs(out.y - y)).toBeLessThan(1e-3);
      expect(Math.sign(out.z) === Math.sign(z) || Math.abs(z) < 0.05).toBe(true);
      expect(Math.abs(out.z - z)).toBeLessThan(0.05);
    }
  });

  it('strings (UTF-8, cut at the cap) and bit copies between writers', () => {
    const w = new BitWriter();
    w.writeBits(3, 2);
    w.writeString('Weapon_RocketLauncher.Single');
    w.writeString('Ünïcødé ✓ 漢字');
    w.writeString('x'.repeat(50), 10);
    const r = new BitReader(w.view());
    expect(r.readBits(2)).toBe(3);
    expect(r.readString()).toBe('Weapon_RocketLauncher.Single');
    expect(r.readString()).toBe('Ünïcødé ✓ 漢字');
    expect(r.readString()).toBe('x'.repeat(10));

    const src = new BitWriter();
    for (let i = 0; i < 77; i++) src.writeBit(i % 3 === 0);
    const dst = new BitWriter();
    dst.writeBits(1, 3);
    dst.writeBitsFrom(src.view(), src.bitLength);
    dst.writeBits(0x5a, 8);
    const rr = new BitReader(dst.view());
    expect(rr.readBits(3)).toBe(1);
    for (let i = 0; i < 77; i++) expect(rr.readBit()).toBe(i % 3 === 0);
    expect(rr.readBits(8)).toBe(0x5a);
  });

  it('rollback and the byte cap', () => {
    const w = new BitWriter(16, 4);
    w.writeBits(0xabc, 12);
    const mark = w.mark();
    w.writeBits(0xffff, 16);
    expect(w.overflowed).toBe(false);
    w.writeBits(0xff, 8);
    expect(w.overflowed).toBe(true);
    w.rollback(mark);
    expect(w.overflowed).toBe(false);
    expect(w.bitLength).toBe(12);
    w.writeBits(0x5, 4);
    const r = new BitReader(w.view());
    expect(r.readBits(12)).toBe(0xabc);
    expect(r.readBits(4)).toBe(0x5);
    expect(r.readBits(8)).toBe(0); // past the end: zero, flagged
    expect(r.overflowed).toBe(true);
  });

  it('a truncated buffer overflows instead of throwing', () => {
    const w = new BitWriter();
    w.writeString('hello world');
    const r = new BitReader(w.view().subarray(0, 4));
    expect(r.readString()).toBe('');
    expect(r.overflowed).toBe(true);
  });
});
