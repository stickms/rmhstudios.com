/**
 * M3 — the visibility family's shared alpha curve.
 *
 * `visibilityAlpha` is the one function all four modes (plus the legacy
 * `invisible` alias, `fadeOut`) go through. `travelRatio` is 1.0 at spawn and
 * 0.0 at the judgement line — the domain `GameCanvas.tsx` already computed
 * for the pre-split `invisible` modifier.
 */

import { describe, expect, it } from 'vitest';
import { visibilityAlpha } from '../modifiers';
import { MAX_LANE_COVER, VISIBILITY_MODES } from '../constants';

describe('visibilityAlpha — fadeOut (the original `invisible` behaviour)', () => {
  it('is fully visible far from the hit line', () => {
    expect(visibilityAlpha(1.0, 'fadeOut', 0)).toBe(1);
    expect(visibilityAlpha(0.5, 'fadeOut', 0)).toBe(1);
    expect(visibilityAlpha(0.2, 'fadeOut', 0)).toBe(1);
  });

  it('is fully invisible right at the hit line, below the old 0.08 cutoff', () => {
    expect(visibilityAlpha(0, 'fadeOut', 0)).toBe(0);
    expect(visibilityAlpha(0.07, 'fadeOut', 0)).toBe(0);
  });

  it('fades linearly between 0.08 and 0.2, reproducing the pre-split formula', () => {
    expect(visibilityAlpha(0.14, 'fadeOut', 0)).toBeCloseTo((0.14 - 0.08) / 0.12, 5);
  });

  it('is what an unrecognised mode falls back to', () => {
    // Deliberately an invalid mode (a stale persisted value, say), to pin the
    // `default` branch rather than relying on a type system that would never
    // let this call through in real code.
    const bogus = 'bogus' as unknown as (typeof VISIBILITY_MODES)[number];
    expect(visibilityAlpha(1.0, bogus, 0)).toBe(visibilityAlpha(1.0, 'fadeOut', 0));
  });
});

describe('visibilityAlpha — fadeIn', () => {
  it('is invisible at spawn', () => {
    expect(visibilityAlpha(1.0, 'fadeIn', 0)).toBe(0);
  });

  it('is fully visible near the hit line', () => {
    expect(visibilityAlpha(0.1, 'fadeIn', 0)).toBe(1);
    expect(visibilityAlpha(0, 'fadeIn', 0)).toBe(1);
  });

  it('reads the opposite way to fadeOut at the extremes', () => {
    expect(visibilityAlpha(1.0, 'fadeOut', 0)).toBe(1);
    expect(visibilityAlpha(1.0, 'fadeIn', 0)).toBe(0);
    expect(visibilityAlpha(0, 'fadeOut', 0)).toBe(0);
    expect(visibilityAlpha(0, 'fadeIn', 0)).toBe(1);
  });
});

describe('visibilityAlpha — flashlight', () => {
  it('is only visible in a narrow ring around the judgement line', () => {
    expect(visibilityAlpha(0.1, 'flashlight', 0)).toBe(1);
    expect(visibilityAlpha(0.5, 'flashlight', 0)).toBe(0);
    expect(visibilityAlpha(0.9, 'flashlight', 0)).toBe(0);
    expect(visibilityAlpha(1.0, 'flashlight', 0)).toBe(0);
  });
});

describe('visibilityAlpha — laneCover (V10)', () => {
  it('hides nothing at coverFraction 0', () => {
    expect(visibilityAlpha(0.99, 'laneCover', 0)).toBe(1);
    expect(visibilityAlpha(0.5, 'laneCover', 0)).toBe(1);
  });

  it('hides almost everything at the maximum cover', () => {
    expect(visibilityAlpha(0.5, 'laneCover', MAX_LANE_COVER)).toBe(0);
    expect(visibilityAlpha(0.1, 'laneCover', MAX_LANE_COVER)).toBe(1);
  });

  it('the visible fraction is exactly (1 - coverFraction) of the approach', () => {
    const cover = 0.4;
    expect(visibilityAlpha(0.61, 'laneCover', cover)).toBe(0);
    expect(visibilityAlpha(0.59, 'laneCover', cover)).toBe(1);
  });
});

describe('visibilityAlpha — general contract', () => {
  it('never returns a value outside [0, 1] for any registered mode', () => {
    for (const mode of VISIBILITY_MODES) {
      for (let r = -0.5; r <= 1.5; r += 0.05) {
        const alpha = visibilityAlpha(r, mode, 0.3);
        expect(alpha).toBeGreaterThanOrEqual(0);
        expect(alpha).toBeLessThanOrEqual(1);
      }
    }
  });
});
