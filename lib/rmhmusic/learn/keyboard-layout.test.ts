import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  BLACK_SHARE,
  MIN_WHITE_PX,
  clampOctave,
  inView,
  swipeShift,
  whiteKeysFor,
  windowKeys,
} from './keyboard-layout';

describe('on-screen keyboard window', () => {
  it('fits whole white keys of at least 44px, one to two octaves', () => {
    expect(whiteKeysFor(0)).toBe(7);
    expect(whiteKeysFor(308)).toBe(7); // a 320px phone
    expect(whiteKeysFor(336)).toBe(7); // 360px phone
    expect(whiteKeysFor(366)).toBe(8); // 390px phone
    expect(whiteKeysFor(616)).toBe(14);
    expect(whiteKeysFor(1200)).toBe(14);
    for (let px = 308; px <= 616; px++) {
      const n = whiteKeysFor(px);
      if (px >= 7 * MIN_WHITE_PX) expect(px / n).toBeGreaterThanOrEqual(MIN_WHITE_PX);
      expect(MIN_WHITE_PX * BLACK_SHARE).toBeGreaterThanOrEqual(24);
    }
  });

  it('the CSS container queries use the same steps (one per 44px from 8 to 14 keys)', () => {
    const css = readFileSync(join(__dirname, '../../../components/rmhmusic/rmhmusic.css'), 'utf8');
    for (let n = 8; n <= 14; n++) {
      const px = n * MIN_WHITE_PX;
      const re = new RegExp(
        `@container \\(min-width: ${px}px\\) \\{\\s*\\.rmm-keys__bed \\{\\s*--rmm-white-count: ${n};`,
      );
      expect(css, `missing the ${n}-key step at ${px}px`).toMatch(re);
      expect(whiteKeysFor(px)).toBe(n);
      expect(whiteKeysFor(px - 1)).toBe(Math.max(7, n - 1));
    }
  });

  it('a window is two octaves from a C', () => {
    const keys = windowKeys(4);
    expect(keys[0]).toEqual({ midi: 60, black: false, whiteBefore: 0 });
    expect(keys).toHaveLength(24);
    expect(keys.filter((k) => !k.black)).toHaveLength(14);
    expect(keys.find((k) => k.midi === 61)).toEqual({ midi: 61, black: true, whiteBefore: 1 });
    expect(windowKeys(3)[0].midi).toBe(48);
  });

  it('knows which keys are in view', () => {
    const keys = windowKeys(4);
    const shown = keys.filter((k) => inView(k, 8)).map((k) => k.midi);
    // C4 … C5 plus C#5, half of which shows at the right edge.
    expect(shown).toEqual([60, 61, 62, 63, 64, 65, 66, 67, 68, 69, 70, 71, 72, 73]);
    expect(keys.filter((k) => inView(k, 14))).toHaveLength(24);
  });

  it('clamps the octave and reads swipes', () => {
    expect(clampOctave(0)).toBe(2);
    expect(clampOctave(9)).toBe(6);
    expect(swipeShift(-60, 5)).toBe(1);
    expect(swipeShift(60, 5)).toBe(-1);
    expect(swipeShift(30, 0)).toBe(0);
    expect(swipeShift(50, 60)).toBe(0);
  });
});
