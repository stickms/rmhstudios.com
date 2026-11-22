import { describe, expect, it } from 'vitest';
import { bitLength, formatInBase, groupDigits, parseInBase, widthView } from '@/lib/toolbox/base';

describe('parseInBase', () => {
  it('reads prefixes, signs and separators', () => {
    expect(parseInBase('0xFF', 16)).toEqual({ ok: true, value: 255n });
    expect(parseInBase('-0b1010', 2)).toEqual({ ok: true, value: -10n });
    expect(parseInBase('1_000_000', 10)).toEqual({ ok: true, value: 1_000_000n });
    expect(parseInBase('zz', 36)).toEqual({ ok: true, value: 1295n });
  });

  it('keeps precision past 2^53', () => {
    const r = parseInBase('18446744073709551615', 10);
    expect(r.ok && formatInBase(r.value, 16)).toBe('ffffffffffffffff');
    expect(parseInBase('9007199254740993', 10)).toEqual({ ok: true, value: 9007199254740993n });
  });

  it('names the first bad digit', () => {
    expect(parseInBase('102', 2)).toEqual({ ok: false, reason: 'bad-digit', digit: '2' });
    expect(parseInBase('', 10)).toEqual({ ok: false, reason: 'empty' });
    expect(parseInBase('-', 10)).toEqual({ ok: false, reason: 'empty' });
    expect(parseInBase('1', 37)).toEqual({ ok: false, reason: 'bad-base' });
  });
});

describe('groupDigits', () => {
  it('groups from the right and keeps the sign', () => {
    expect(groupDigits('11110000', 4)).toBe('1111 0000');
    expect(groupDigits('-1ffff', 4)).toBe('-1 ffff');
    expect(groupDigits('0', 4)).toBe('0');
  });
});

describe('widthView', () => {
  it('shows the two’s-complement pattern of a negative value', () => {
    expect(widthView(-1n, 8)).toEqual({
      width: 8,
      fits: true,
      bits: '11111111',
      hex: 'ff',
      unsigned: 255n,
      signed: -1n,
    });
    expect(widthView(-128n, 8)).toMatchObject({ bits: '10000000', signed: -128n });
  });

  it('reads a high-bit pattern as signed', () => {
    expect(widthView(0x8000n, 16)).toMatchObject({ unsigned: 32768n, signed: -32768n, hex: '8000' });
    expect(widthView(5n, 32).bits).toBe('00000000000000000000000000000101');
  });

  it('says when a value does not fit', () => {
    expect(widthView(256n, 8).fits).toBe(false);
    expect(widthView(-129n, 8).fits).toBe(false);
    expect(widthView(2n ** 64n - 1n, 64).fits).toBe(true);
  });
});

describe('bitLength', () => {
  it('counts magnitude bits', () => {
    expect(bitLength(0n)).toBe(1);
    expect(bitLength(255n)).toBe(8);
    expect(bitLength(-256n)).toBe(9);
  });
});
