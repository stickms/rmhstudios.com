import { describe, expect, it } from 'vitest';

import { FLASH_LUMINANCE, IMPACT, IMPACT_STOPS, impactSample, radiusAbove } from '../impact';

describe('impact timeline', () => {
  it('lasts 260–420ms and is gone after', () => {
    expect(IMPACT.lifeMs).toBeGreaterThanOrEqual(260);
    expect(IMPACT.lifeMs).toBeLessThanOrEqual(420);
    expect(impactSample(-1)).toBeNull();
    expect(impactSample(IMPACT.lifeMs)).toBeNull();
    expect(impactSample(0)).not.toBeNull();
  });

  it('flash rises then decays monotonically; the ring only grows and only fades', () => {
    let peakSeen = false;
    let lastFlash = -1;
    let lastRing = -1;
    let lastRingAlpha = Infinity;
    for (let t = 0; t < IMPACT.lifeMs; t += 2) {
      const s = impactSample(t)!;
      if (t >= IMPACT.riseMs) {
        if (peakSeen) expect(s.flash).toBeLessThanOrEqual(lastFlash + 1e-9);
        peakSeen = true;
      } else {
        expect(s.flash).toBeGreaterThanOrEqual(lastFlash);
      }
      lastFlash = s.flash;
      expect(s.ringRadius).toBeGreaterThanOrEqual(lastRing);
      lastRing = s.ringRadius;
      if (t >= IMPACT.riseMs) {
        expect(s.ringAlpha).toBeLessThanOrEqual(lastRingAlpha + 1e-9);
        lastRingAlpha = s.ringAlpha;
      }
      expect(s.flash).toBeGreaterThanOrEqual(0);
      expect(s.flash).toBeLessThanOrEqual(1);
    }
  });

  it('is bounded in radius (no large-area flash) and scales down under calm', () => {
    for (let t = 0; t < IMPACT.lifeMs; t += 5) {
      const s = impactSample(t)!;
      expect(s.ringRadius).toBeLessThanOrEqual(IMPACT.ringEndPx);
      expect(s.flashRadius).toBeLessThanOrEqual(IMPACT.clickFlashRadiusPx);
      expect(s.streakLength).toBeLessThanOrEqual(IMPACT.streakLenPx);
      const calm = impactSample(t, { scale: 0.6 })!;
      expect(calm.flash).toBeLessThanOrEqual(s.flash);
      expect(calm.ringAlpha).toBeLessThanOrEqual(s.ringAlpha);
    }
    expect(IMPACT.ringEndPx).toBeLessThan(FLASH_LUMINANCE.maxFlashRadiusPx);
    expect(IMPACT.clickFlashRadiusPx).toBeLessThan(FLASH_LUMINANCE.maxFlashRadiusPx);
    expect(FLASH_LUMINANCE.maxFlashRadiusPx).toBeLessThanOrEqual(160);
  });
});

describe('the luminance cap (WCAG 2.3.1)', () => {
  it('the radius above a threshold follows the gradient stops', () => {
    expect(radiusAbove(IMPACT_STOPS, 1, 0)).toBe(1);
    expect(radiusAbove(IMPACT_STOPS, 1, 1)).toBe(0);
    expect(radiusAbove(IMPACT_STOPS, 0.05, 0.1)).toBe(0); // never reaches the threshold
    const a = radiusAbove(IMPACT_STOPS, 0.5, 0.1);
    const b = radiusAbove(IMPACT_STOPS, 0.9, 0.1);
    expect(b).toBeGreaterThan(a);
  });
  // The combined per-pixel cap and the frame's area budget over every layer: flash-budget.test.ts.
});
