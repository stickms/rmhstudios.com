/**
 * Integer base conversion with BigInt, so a 64-bit or a 200-digit value
 * converts exactly (a JavaScript number loses precision past 2^53).
 *
 * Input may carry a sign, a `0x`/`0o`/`0b` prefix, and `_`, space or `,`
 * digit separators. Signed widths show the two's-complement bit pattern of a
 * negative value and the signed reading of a pattern, the conversion people
 * reach for when reading a register or a packet dump.
 */

export const DIGITS = '0123456789abcdefghijklmnopqrstuvwxyz';

export type BaseParseResult =
  | { ok: true; value: bigint }
  | { ok: false; reason: 'empty' | 'bad-base' | 'bad-digit'; digit?: string };

const PREFIXES: Record<string, number> = { '0x': 16, '0o': 8, '0b': 2 };

export function parseInBase(input: string, base: number): BaseParseResult {
  if (!Number.isInteger(base) || base < 2 || base > 36) return { ok: false, reason: 'bad-base' };
  let s = input.trim().toLowerCase().replace(/[\s_,]/g, '');
  let negative = false;
  if (s.startsWith('-') || s.startsWith('+')) {
    negative = s.startsWith('-');
    s = s.slice(1);
  }
  const prefix = PREFIXES[s.slice(0, 2)];
  if (prefix === base) s = s.slice(2);
  if (!s) return { ok: false, reason: 'empty' };
  let value = 0n;
  const b = BigInt(base);
  for (const ch of s) {
    const d = DIGITS.indexOf(ch);
    if (d < 0 || d >= base) return { ok: false, reason: 'bad-digit', digit: ch };
    value = value * b + BigInt(d);
  }
  return { ok: true, value: negative ? -value : value };
}

export function formatInBase(value: bigint, base: number): string {
  if (base < 2 || base > 36) throw new RangeError('base must be 2 to 36');
  return value.toString(base);
}

/** Split digits into groups from the right (`1111 0000`), for reading long binary or hex. */
export function groupDigits(digits: string, size: number, separator = ' '): string {
  const negative = digits.startsWith('-');
  const body = negative ? digits.slice(1) : digits;
  const groups: string[] = [];
  for (let end = body.length; end > 0; end -= size) groups.unshift(body.slice(Math.max(0, end - size), end));
  return (negative ? '-' : '') + groups.join(separator);
}

export const WIDTHS = [8, 16, 32, 64] as const;
export type Width = (typeof WIDTHS)[number];

export interface WidthView {
  width: Width;
  /** Whether the value fits this width as signed or unsigned. */
  fits: boolean;
  /** The bit pattern: two's complement when negative, zero-padded to the width. */
  bits?: string;
  hex?: string;
  /** The pattern read as an unsigned integer. */
  unsigned?: bigint;
  /** The pattern read as a signed (two's complement) integer. */
  signed?: bigint;
}

export function widthView(value: bigint, width: Width): WidthView {
  const w = BigInt(width);
  const min = -(1n << (w - 1n));
  const max = (1n << w) - 1n;
  if (value < min || value > max) return { width, fits: false };
  const pattern = value < 0n ? (1n << w) + value : value;
  const signed = pattern >= 1n << (w - 1n) ? pattern - (1n << w) : pattern;
  return {
    width,
    fits: true,
    bits: pattern.toString(2).padStart(width, '0'),
    hex: pattern.toString(16).padStart(width / 4, '0'),
    unsigned: pattern,
    signed,
  };
}

/** The number of bits needed for the magnitude (0 needs 1). */
export function bitLength(value: bigint): number {
  const v = value < 0n ? -value : value;
  return v === 0n ? 1 : v.toString(2).length;
}
