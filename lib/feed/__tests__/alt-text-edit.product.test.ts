/** Describe images after posting (sprint 05 #16): sanitising, count capping and the list's pure helpers. */
import { describe, expect, it } from 'vitest';
import {
  MAX_IMAGE_ALT_LENGTH,
  MISSING_ALT_COUNT_CAP,
  alignAlts,
  altsMatchImages,
  capMissingCount,
  decodeCursor,
  encodeCursor,
  firstLineOf,
  missingAltCount,
  sanitizeAlt,
  sanitizeAlts,
  thumbnailIndex,
} from '@/lib/feed/alt-text-edit';

describe('sanitizeAlt', () => {
  it('trims, strips control characters and keeps one line of plain text', () => {
    expect(sanitizeAlt('  hello  ')).toBe('hello');
    expect(sanitizeAlt('a\u0000b\u0007c')).toBe('a b c');
    expect(sanitizeAlt('line one\r\nline two\tend')).toBe('line one line two end');
    expect(sanitizeAlt('x y\u0085z')).toBe('x y z');
    expect(sanitizeAlt('\u0001\u0002')).toBe('');
  });

  it('does not interpret markup: it is stored as the text it is', () => {
    expect(sanitizeAlt('<b>hi</b> & bye')).toBe('<b>hi</b> & bye');
  });

  it('caps a description at the length limit', () => {
    const out = sanitizeAlt('é'.repeat(MAX_IMAGE_ALT_LENGTH + 50));
    expect(out).toHaveLength(MAX_IMAGE_ALT_LENGTH);
  });

  it('maps a whole list', () => {
    expect(sanitizeAlts([' a ', '', 'b\n'])).toEqual(['a', '', 'b']);
  });
});

describe('alignment', () => {
  it('needs exactly one entry per image', () => {
    expect(altsMatchImages(['u1', 'u2'], ['a', 'b'])).toBe(true);
    expect(altsMatchImages(['u1', 'u2'], ['a'])).toBe(false);
    expect(altsMatchImages(['u1'], ['a', 'b'])).toBe(false);
    expect(altsMatchImages([], [])).toBe(false);
  });

  it('pads a short stored list with empty strings', () => {
    expect(alignAlts(['u1', 'u2', 'u3'], ['a'])).toEqual(['a', '', '']);
    expect(alignAlts(['u1'], undefined)).toEqual(['']);
  });

  it('counts the images still missing a description', () => {
    expect(missingAltCount(['u1', 'u2', 'u3'], ['a', '  '])).toBe(2);
    expect(missingAltCount(['u1'], ['a'])).toBe(0);
  });

  it('shows the first undescribed image as the row thumbnail', () => {
    expect(
      thumbnailIndex({
        imageUrls: ['u1', 'u2'],
        imageAlts: ['a', ''],
      }),
    ).toBe(1);
    expect(
      thumbnailIndex({
        imageUrls: ['u1', 'u2'],
        imageAlts: ['a', 'b'],
      }),
    ).toBe(0);
  });
});

describe('capMissingCount', () => {
  it('shows the number up to 99 and flags anything beyond', () => {
    expect(capMissingCount(0)).toEqual({
      count: 0,
      capped: false,
    });
    expect(capMissingCount(99)).toEqual({
      count: 99,
      capped: false,
    });
    expect(capMissingCount(MISSING_ALT_COUNT_CAP + 1)).toEqual({
      count: 99,
      capped: true,
    });
    expect(capMissingCount(5000)).toEqual({
      count: 99,
      capped: true,
    });
    expect(capMissingCount(-4)).toEqual({
      count: 0,
      capped: false,
    });
  });
});

describe('firstLineOf', () => {
  it('is the first non-empty line, shortened', () => {
    expect(firstLineOf('\n\n  hello world \nsecond')).toBe('hello world');
    expect(firstLineOf('')).toBe('');
    const long = firstLineOf('w'.repeat(200));
    expect(long.length).toBeLessThanOrEqual(80);
    expect(long.endsWith('…')).toBe(true);
  });
});

describe('cursor', () => {
  it('round-trips a keyset position and refuses garbage', () => {
    const at = new Date('2026-03-04T05:06:07.000Z');
    expect(decodeCursor(encodeCursor(at, 'abc123'))).toEqual({
      createdAt: at,
      id: 'abc123',
    });
    expect(decodeCursor('nope')).toBeNull();
    expect(decodeCursor('|id')).toBeNull();
    expect(decodeCursor('2026-03-04T05:06:07.000Z|')).toBeNull();
    expect(decodeCursor('not-a-date|id')).toBeNull();
  });
});
