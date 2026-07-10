import { describe, it, expect } from 'vitest';
import { cookQuality, feedbackBand, cookOutput, DIAL_COUNT } from '../chemistry';

describe('cookQuality', () => {
  it('is 1 for a perfect match', () => {
    expect(cookQuality([0.5, 0.3, 0.2], [0.5, 0.3, 0.2])).toBeCloseTo(1, 5);
  });
  it('is 0 for the worst-case opposite', () => {
    expect(cookQuality([0, 0, 0], [1, 1, 1])).toBeCloseTo(0, 5);
  });
  it('decreases as distance grows (monotonic)', () => {
    const near = cookQuality([0.5, 0.5, 0.5], [0.55, 0.5, 0.5]);
    const far = cookQuality([0.5, 0.5, 0.5], [0.9, 0.5, 0.5]);
    expect(near).toBeGreaterThan(far);
  });
  it('is ratio-invariant: scaling a dial vector does not change quality', () => {
    // [1,0,0] and [0.5,0,0] both normalize to [1,0,0] — should be a perfect match
    expect(cookQuality([1, 0, 0], [0.5, 0, 0])).toBeCloseTo(1, 5);
  });
});

describe('feedbackBand', () => {
  it('reports hot near the target and cold far away', () => {
    expect(feedbackBand([0.5, 0.3, 0.2], [0.5, 0.3, 0.2])).toBe('hot');
    expect(feedbackBand([0, 0, 0], [1, 1, 1])).toBe('cold');
  });
  it('returns warm for a dial/target pair with cookQuality in [0.6, 0.85)', () => {
    // dials=[0.6,0.2,0.2] (already sums to 1), target=[1/3,1/3,1/3]
    // euclidean(dn, tn) = sqrt((0.6-1/3)^2 + 2*(0.2-1/3)^2) ≈ 0.3266
    // MAXDIST = sqrt(2) ≈ 1.4142
    // q = 1 - 0.3266/sqrt(2) ≈ 0.769  →  in [0.6, 0.85)  →  warm
    expect(feedbackBand([0.6, 0.2, 0.2], [1 / 3, 1 / 3, 1 / 3])).toBe('warm');
  });
});

describe('cookOutput', () => {
  it('maps quality to a cooked stock entry', () => {
    const e = cookOutput('glimmerdust', 1);
    expect(e.baseId).toBe('glimmerdust');
    expect(e.qualityMult).toBeCloseTo(1.3, 5);
    expect(e.units).toBe(6);              // q=1 -> COOK_YIELD.max
    expect(e.bonusEffects).toEqual(['glowing']);
  });
  it('low quality -> no bonus, fewer units, reduced value', () => {
    const e = cookOutput('glimmerdust', 0);
    expect(e.bonusEffects).toEqual([]);
    expect(e.units).toBe(2);              // COOK_YIELD.min
    expect(e.qualityMult).toBeCloseTo(0.7, 5);
  });
  it('exposes DIAL_COUNT of 3', () => expect(DIAL_COUNT).toBe(3));
});
