import { describe, test, expect } from 'vitest';
import {
  MAX_SURFACE_EDGE,
  MAX_SURFACE_PIXELS,
  quantiseDisplayScale,
  readDisplayScale,
  surfaceDprFor,
} from '@/lib/display-scale';

describe('readDisplayScale', () => {
  test('is the display ratio on a page that has not been pinched', () => {
    expect(readDisplayScale({ devicePixelRatio: 2, visualViewport: { scale: 1 } })).toBe(2);
  });

  test('follows page zoom, which moves devicePixelRatio', () => {
    // A 2× display at 200% browser zoom reports 4.
    expect(readDisplayScale({ devicePixelRatio: 4, visualViewport: { scale: 1 } })).toBe(4);
  });

  test('follows pinch zoom, which moves nothing but visualViewport.scale', () => {
    expect(readDisplayScale({ devicePixelRatio: 3, visualViewport: { scale: 2 } })).toBe(6);
  });

  test('stops following a pinch once the extra pixels are mostly off-screen', () => {
    expect(readDisplayScale({ devicePixelRatio: 3, visualViewport: { scale: 5 } })).toBe(6);
  });

  test('falls back to 1 for the readings a browser may not supply', () => {
    expect(readDisplayScale({})).toBe(1);
    expect(readDisplayScale({ devicePixelRatio: 0, visualViewport: null })).toBe(1);
    expect(readDisplayScale({ devicePixelRatio: Number.NaN })).toBe(1);
    expect(readDisplayScale({ devicePixelRatio: 2, visualViewport: {} })).toBe(2);
  });
});

describe('quantiseDisplayScale', () => {
  test('leaves the ratios real displays report exactly where they are', () => {
    for (const dpr of [1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4]) {
      expect(quantiseDisplayScale(dpr)).toBe(dpr);
    }
  });

  test('rounds up, so the surface is never left under the display', () => {
    expect(quantiseDisplayScale(1.1)).toBe(1.25);
    expect(quantiseDisplayScale(2.01)).toBe(2.25);
  });

  test('snaps a continuous pinch to a handful of steps', () => {
    const steps = new Set([1.02, 1.09, 1.13, 1.2, 1.24].map(quantiseDisplayScale));
    expect(steps).toEqual(new Set([1.25]));
  });

  test('never returns less than a whole pixel', () => {
    expect(quantiseDisplayScale(0)).toBe(1);
    expect(quantiseDisplayScale(-2)).toBe(1);
    expect(quantiseDisplayScale(Number.NaN)).toBe(1);
  });
});

describe('surfaceDprFor', () => {
  test('renders at the display scale when there is headroom for it', () => {
    expect(surfaceDprFor(2, 1200, 800)).toBe(2);
    expect(surfaceDprFor(4, 600, 400)).toBe(4);
  });

  test('page zoom costs no extra pixels — the stage shrinks as the ratio grows', () => {
    const unzoomed = surfaceDprFor(2, 1400, 900);
    const zoomed = surfaceDprFor(4, 700, 450); // same screen, 200% browser zoom
    expect(zoomed).toBe(4);
    expect(700 * 450 * zoomed ** 2).toBe(1400 * 900 * unzoomed ** 2);
  });

  test('leaves the stage the reader could already ask for untouched', () => {
    // 5K display, in-app zoom at its 1.5 maximum, two-times ratio: the pre-existing
    // worst case, which must not come back sharpened down.
    expect(surfaceDprFor(2, 2560 * 1.5, 1400 * 1.5)).toBe(2);
  });

  test('holds an over-large surface to the pixel ceiling', () => {
    const dpr = surfaceDprFor(4, 2560 * 1.5, 1400 * 1.5); // that stage, pinched as well
    expect(dpr).toBeGreaterThan(2); // still sharper than before the pinch
    expect(dpr).toBeLessThan(4);
    expect(2560 * 1.5 * (1400 * 1.5) * dpr ** 2).toBeCloseTo(MAX_SURFACE_PIXELS, 0);
  });

  test('holds a long edge under the GPU ceiling even when the pixel count fits', () => {
    // A tall phone stage: its longest edge runs out before its area does.
    const dpr = surfaceDprFor(16, 390, 780);
    expect(780 * dpr).toBeCloseTo(MAX_SURFACE_EDGE, 0);
    expect(390 * 780 * dpr ** 2).toBeLessThan(MAX_SURFACE_PIXELS);
  });

  test('never drops below one device pixel per CSS pixel', () => {
    expect(surfaceDprFor(0.5, 1200, 800)).toBe(1);
    // A stage bigger than any ceiling still renders, just without magnification.
    expect(surfaceDprFor(2, 40000, 40000)).toBe(1);
  });

  test('imposes no ceiling before the stage has been measured', () => {
    expect(surfaceDprFor(3, 0, 0)).toBe(3);
    expect(surfaceDprFor(3, 1200, 0)).toBe(3);
  });

  test('treats a missing scale as a plain 1× surface', () => {
    expect(surfaceDprFor(Number.NaN, 1200, 800)).toBe(1);
    expect(surfaceDprFor(0, 1200, 800)).toBe(1);
  });
});
