/**
 * The AR mode's detection and its palette bridge.
 *
 * Both exist to fail SAFE. `arSupported()` decides whether a control appears at
 * all, so every unexpected shape of `navigator.xr` has to resolve `false`
 * rather than throw — a rejected promise here would surface as a button that
 * exists and cannot work. `readPalette()` crosses from CSS into WebGL, where a
 * missing custom property cannot fall back to "inherit"; it falls back to
 * something visible instead, because a card drawn in the wrong colour is a bug
 * a player can report and one drawn in nothing is a bug nobody can describe.
 */

import { describe, it, expect, afterEach, vi } from 'vitest';
import {
  AR_CARD_HEIGHT_M,
  AR_CARD_WIDTH_M,
  AR_DOT_RADIUS,
  AR_DOT_SLOTS,
  AR_GLOBE_RADIUS_M,
  arSupported,
  hasWebXr,
  readPalette,
} from '@/lib/globeset/xr';
import { COLOR_COUNT } from '@/lib/globeset/cards';

afterEach(() => vi.unstubAllGlobals());

/** A `navigator` whose `xr` is whatever the case under test needs. */
function stubNavigator(xr: unknown, present = true): void {
  vi.stubGlobal('navigator', present ? { xr } : {});
}

describe('arSupported', () => {
  it('is false where the browser has no WebXR at all (every iOS Safari)', async () => {
    stubNavigator(undefined, false);
    expect(hasWebXr()).toBe(false);
    await expect(arSupported()).resolves.toBe(false);
  });

  it('is true only when the runtime says an immersive-ar session can start', async () => {
    const isSessionSupported = vi.fn().mockResolvedValue(true);
    stubNavigator({ isSessionSupported });
    await expect(arSupported()).resolves.toBe(true);
    expect(isSessionSupported).toHaveBeenCalledWith('immersive-ar');
  });

  it('is false for a VR-only runtime that refuses immersive-ar', async () => {
    stubNavigator({ isSessionSupported: vi.fn().mockResolvedValue(false) });
    await expect(arSupported()).resolves.toBe(false);
  });

  it('never rejects, whatever shape navigator.xr turns out to be', async () => {
    for (const xr of [null, {}, { isSessionSupported: 42 }, 'nope']) {
      stubNavigator(xr);
      await expect(arSupported()).resolves.toBe(false);
    }
  });

  it('swallows a runtime that throws or rejects rather than offering a dead button', async () => {
    stubNavigator({
      isSessionSupported: () => {
        throw new Error('runtime exploded');
      },
    });
    await expect(arSupported()).resolves.toBe(false);

    stubNavigator({ isSessionSupported: vi.fn().mockRejectedValue(new Error('denied')) });
    await expect(arSupported()).resolves.toBe(false);
  });

  it('treats a non-boolean answer as no', async () => {
    stubNavigator({ isSessionSupported: vi.fn().mockResolvedValue('yes') });
    await expect(arSupported()).resolves.toBe(false);
  });
});

describe('readPalette', () => {
  const element = {} as Element;

  function withProperties(map: Record<string, string>): void {
    vi.stubGlobal('getComputedStyle', () => ({
      getPropertyValue: (name: string) => map[name] ?? '',
    }));
  }

  it('reads the globeset group, so the theme and colour-vision ramps reach the room', () => {
    withProperties({
      '--globeset-card-face': ' #ffffff ',
      '--globeset-card-edge': '#000000',
      '--globeset-dot-ink': '#111111',
      '--globeset-dot-red': '#d55e00',
      '--globeset-dot-blue': '#0072b2',
    });
    const palette = readPalette(element);
    expect(palette.face).toBe('#ffffff'); // trimmed
    expect(palette.dots[0]).toBe('#d55e00');
    expect(palette.dots[4]).toBe('#0072b2');
  });

  it('gives one colour per dot', () => {
    withProperties({});
    expect(readPalette(element).dots).toHaveLength(COLOR_COUNT);
  });

  it('falls back to something visible rather than to nothing', () => {
    withProperties({});
    const palette = readPalette(element);
    for (const value of [palette.face, palette.edge, palette.ink, ...palette.dots]) {
      expect(value).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });
});

describe('the physical dimensions', () => {
  it('are a globe you could put on a desk', () => {
    expect(AR_GLOBE_RADIUS_M).toBeGreaterThan(0.1);
    expect(AR_GLOBE_RADIUS_M).toBeLessThan(0.5);
  });

  it('keep the card the same shape as the one on the page', () => {
    expect(AR_CARD_HEIGHT_M / AR_CARD_WIDTH_M).toBeCloseTo(0.7, 10);
  });

  it('fit the cards onto the sphere without overlapping', () => {
    // Seven cards round a sphere: the widest one must be comfortably narrower
    // than the arc between two neighbouring slots.
    const circumference = 2 * Math.PI * AR_GLOBE_RADIUS_M;
    expect(AR_CARD_WIDTH_M).toBeLessThan(circumference / 7);
  });

  it('lay the dots out inside the card face', () => {
    expect(AR_DOT_SLOTS).toHaveLength(COLOR_COUNT);
    for (const slot of AR_DOT_SLOTS) {
      expect(slot.x).toBeGreaterThan(AR_DOT_RADIUS);
      expect(slot.x).toBeLessThan(1 - AR_DOT_RADIUS);
      expect(slot.y).toBeGreaterThan(0);
      expect(slot.y).toBeLessThan(1);
    }
    // Two rows of three, as on the board — colour position is how a player
    // counts a colour across cards, so it must not differ between views.
    expect(new Set(AR_DOT_SLOTS.map((s) => s.y)).size).toBe(2);
    expect(new Set(AR_DOT_SLOTS.map((s) => s.x)).size).toBe(3);
  });
});
