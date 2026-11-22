import { describe, it, expect } from 'vitest';
import { FLAG_KEY_PATTERN, clampRollout, isValidFlagKey } from '@/lib/flags/key';
import { FLAG_KEY_PATTERN as FROM_EVALUATE } from '@/lib/flags/evaluate';

describe('flag keys', () => {
  it('accepts lowercase keys with dots, dashes and underscores', () => {
    for (const k of ['ab', 'new-feed', 'rmhtube.premieres', 'a_b.c-d1']) expect(isValidFlagKey(k)).toBe(true);
  });

  it('rejects uppercase, leading digits/symbols, spaces and out-of-range lengths', () => {
    for (const k of ['A', 'a', 'Flag', '1flag', '-flag', 'has space', 'x'.repeat(65), '']) {
      expect(isValidFlagKey(k)).toBe(false);
    }
  });

  it('is the same pattern the server route re-exports from evaluate', () => {
    expect(FROM_EVALUATE).toBe(FLAG_KEY_PATTERN);
  });
});

describe('clampRollout', () => {
  it('clamps to 0-100 and truncates decimals', () => {
    expect(clampRollout('50')).toBe(50);
    expect(clampRollout('150')).toBe(100);
    expect(clampRollout('-10')).toBe(0);
    expect(clampRollout('33.9')).toBe(33);
    expect(clampRollout(72)).toBe(72);
  });

  it('treats blank or non-numeric input as 0 (off for everyone)', () => {
    expect(clampRollout('')).toBe(0);
    expect(clampRollout('abc')).toBe(0);
    expect(clampRollout(Number.NaN)).toBe(0);
  });
});
