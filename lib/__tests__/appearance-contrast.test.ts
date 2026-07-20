import { describe, it, expect } from 'vitest';
import {
  relativeLuminance,
  contrastRatio,
  readableForeground,
  ensureReadableAccent,
} from '@/lib/appearance/contrast';

describe('luminance & contrast', () => {
  it('computes known luminances', () => {
    expect(relativeLuminance('#000000')).toBeCloseTo(0, 5);
    expect(relativeLuminance('#ffffff')).toBeCloseTo(1, 5);
  });

  it('white/black contrast is 21:1', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 1);
  });

  it('is symmetric', () => {
    expect(contrastRatio('#8b5cf6', '#ffffff')).toBeCloseTo(contrastRatio('#ffffff', '#8b5cf6'), 6);
  });
});

describe('readableForeground', () => {
  it('picks white on dark and black on light', () => {
    expect(readableForeground('#1e1b4b')).toBe('#ffffff');
    expect(readableForeground('#fde68a')).toBe('#111111');
  });
});

describe('ensureReadableAccent', () => {
  it('leaves an already-legible accent unchanged', () => {
    const r = ensureReadableAccent('#4c1d95'); // deep violet, white label passes AA
    expect(r.adjusted).toBe(false);
    expect(contrastRatio(r.hex, r.fg)).toBeGreaterThanOrEqual(4.5);
  });

  it('nudges a too-light accent so its label passes AA', () => {
    const r = ensureReadableAccent('#facc15'); // bright yellow — low contrast either way
    expect(contrastRatio(r.hex, r.fg)).toBeGreaterThanOrEqual(4.5);
  });

  it('always returns an AA-legible pair for saturated mid-tones', () => {
    for (const hex of ['#3b82f6', '#10b981', '#ec4899', '#f97316', '#06b6d4']) {
      const r = ensureReadableAccent(hex);
      expect(contrastRatio(r.hex, r.fg)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('throws on invalid hex', () => {
    expect(() => ensureReadableAccent('nope')).toThrow();
  });
});
