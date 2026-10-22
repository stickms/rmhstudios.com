import { describe, expect, it } from 'vitest';
import { luminance, parseColor, resolveColor } from '../color';

describe('computed colour parsing', () => {
  it('reads rgb() and rgba() in comma and space syntax', () => {
    expect(parseColor('rgb(255, 128, 0)')).toEqual([1, 128 / 255, 0, 1]);
    expect(parseColor('rgba(10, 20, 30, 0.25)')).toEqual([10 / 255, 20 / 255, 30 / 255, 0.25]);
    expect(parseColor('rgb(10 20 30 / 0.5)')).toEqual([10 / 255, 20 / 255, 30 / 255, 0.5]);
    expect(parseColor('rgb(10 20 30 / 50%)')).toEqual([10 / 255, 20 / 255, 30 / 255, 0.5]);
  });
  it('reads color(srgb …), which is what color-mix() computes to', () => {
    const c = parseColor('color(srgb 0.93 0.95 0.97 / 0.66)')!;
    expect(c[0]).toBeCloseTo(0.93, 9);
    expect(c[1]).toBeCloseTo(0.95, 9);
    expect(c[2]).toBeCloseTo(0.97, 9);
    expect(c[3]).toBeCloseTo(0.66, 9);
    expect(parseColor('color(srgb 1 0 0)')).toEqual([1, 0, 0, 1]);
  });
  it('keeps a 10% tint exact (a canvas readback would not)', () => {
    expect(parseColor('color(srgb 0.9 0.92 0.96 / 0.1)')![3]).toBeCloseTo(0.1, 9);
  });
  it('treats transparent as zero and rejects what it cannot parse', () => {
    expect(parseColor('transparent')).toEqual([0, 0, 0, 0]);
    expect(parseColor('oklch(0.7 0.1 200)')).toBeNull();
    expect(parseColor('')).toBeNull();
    expect(parseColor('not a colour')).toBeNull();
  });
  it('clamps out-of-range channels', () => {
    expect(parseColor('color(srgb 1.4 -0.2 0.5 / 3)')).toEqual([1, 0, 0.5, 1]);
  });
  it('falls back when unparseable and there is no document', () => {
    expect(resolveColor('oklch(0.7 0.1 200)', [0.1, 0.2, 0.3, 1])).toEqual([0.1, 0.2, 0.3, 1]);
    expect(resolveColor('rgb(0 0 0)', [1, 1, 1, 1])).toEqual([0, 0, 0, 1]);
  });
  it('orders luminance sensibly', () => {
    expect(luminance([1, 1, 1])).toBeCloseTo(1, 9);
    expect(luminance([0, 0, 0])).toBe(0);
    expect(luminance([0.9, 0.92, 0.96])).toBeGreaterThan(0.5);
    expect(luminance([0.08, 0.09, 0.12])).toBeLessThan(0.5);
  });
});
