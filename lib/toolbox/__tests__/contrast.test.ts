import { describe, expect, it } from 'vitest';
import {
  contrastRatio,
  formatRatio,
  parseColor,
  passes,
  relativeLuminance,
  suggestForeground,
  toHex,
} from '@/lib/toolbox/contrast';

describe('parseColor', () => {
  it('reads hex in its short, long and alpha forms, with or without #', () => {
    expect(parseColor('#fff')).toEqual({ r: 255, g: 255, b: 255 });
    expect(parseColor('336699')).toEqual({ r: 51, g: 102, b: 153 });
    expect(parseColor('#336699cc')).toEqual({ r: 51, g: 102, b: 153 });
    expect(parseColor('#abcd')).toEqual({ r: 170, g: 187, b: 204 });
  });

  it('reads rgb() and hsl() in comma and space syntax', () => {
    expect(parseColor('rgb(10, 20, 30)')).toEqual({ r: 10, g: 20, b: 30 });
    expect(parseColor('rgb(10 20 30 / 50%)')).toEqual({ r: 10, g: 20, b: 30 });
    expect(parseColor('rgba(100%, 0%, 0%, 0.5)')).toEqual({ r: 255, g: 0, b: 0 });
    expect(parseColor('hsl(0, 100%, 50%)')).toEqual({ r: 255, g: 0, b: 0 });
    expect(parseColor('hsl(120deg 100% 25%)')).toEqual({ r: 0, g: 128, b: 0 });
  });

  it('rejects what it cannot read', () => {
    expect(parseColor('')).toBeNull();
    expect(parseColor('#12')).toBeNull();
    expect(parseColor('rgb(1,2)')).toBeNull();
    expect(parseColor('hsl(10, 20, 30)')).toBeNull();
    expect(parseColor('banana')).toBeNull();
  });
});

describe('contrast', () => {
  const black = { r: 0, g: 0, b: 0 };
  const white = { r: 255, g: 255, b: 255 };

  it('gives the WCAG extremes', () => {
    expect(relativeLuminance(black)).toBe(0);
    expect(relativeLuminance(white)).toBeCloseTo(1, 10);
    expect(contrastRatio(black, white)).toBeCloseTo(21, 10);
    expect(contrastRatio(white, white)).toBe(1);
  });

  it('matches the published ratio for #767676 on white (4.54:1)', () => {
    const grey = parseColor('#767676');
    expect(grey).not.toBeNull();
    expect(formatRatio(contrastRatio(grey!, white))).toBe('4.54');
    expect(passes(contrastRatio(grey!, white), 'aa-normal')).toBe(true);
    expect(passes(contrastRatio(grey!, white), 'aaa-normal')).toBe(false);
  });

  it('rounds the displayed ratio down so a displayed pass is a real pass', () => {
    expect(formatRatio(4.499)).toBe('4.49');
    expect(formatRatio(21)).toBe('21.00');
  });

  it('suggests the nearest passing lightness of the same hue', () => {
    const fg = parseColor('#999999')!;
    const suggestion = suggestForeground(fg, white, 4.5);
    expect(suggestion).not.toBeNull();
    expect(contrastRatio(suggestion!, white)).toBeGreaterThanOrEqual(4.5);
    // It got darker, not lighter, because white cannot get lighter.
    expect(relativeLuminance(suggestion!)).toBeLessThan(relativeLuminance(fg));
    expect(toHex(suggestForeground(black, white, 7)!)).toBe('#000000');
  });

  it('returns null when no lightness can reach the target', () => {
    const grey = parseColor('#777777')!;
    expect(suggestForeground(grey, grey, 22)).toBeNull();
  });
});
