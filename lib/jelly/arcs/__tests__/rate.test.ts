import { describe, expect, it } from 'vitest';

import {
  ARC_BUDGET,
  chargeAt,
  chargeEligible,
  clickBoltCount,
  clickWeight,
  drainCharge,
  modeMultiplier,
  nextAmbientDelayMs,
  pairRate,
  pickWeighted,
  totalRate,
} from '../rate';
import { mulberry32 } from '../rng';

describe('pairRate', () => {
  it('is λ0 at contact, monotone decreasing, and 0 beyond maxGap', () => {
    expect(pairRate(0)).toBe(ARC_BUDGET.lambda0);
    let prev = Infinity;
    for (let gap = 0; gap <= ARC_BUDGET.maxGap; gap += 4) {
      const r = pairRate(gap);
      expect(r).toBeLessThan(prev);
      prev = r;
    }
    expect(pairRate(ARC_BUDGET.maxGap + 0.01)).toBe(0);
    expect(pairRate(-1)).toBe(0);
    expect(pairRate(Number.NaN)).toBe(0);
  });

  it('matches the worked numbers in §2.2', () => {
    expect(pairRate(8)).toBeCloseTo(0.042, 3);
    expect(pairRate(24)).toBeCloseTo(0.03, 3);
    expect(pairRate(48)).toBeCloseTo(0.018, 3);
    expect(pairRate(120)).toBeCloseTo(0.004, 3);
  });

  it('a pair at 8px is exp((120 − 8)/48) times as likely as one at 120px', () => {
    expect(pairRate(8) / pairRate(120)).toBeCloseTo(Math.exp((120 - 8) / 48), 10);
  });
});

describe('total rate and scheduling', () => {
  it('caps the superposed rate at 0.5/s, and lower on tiers with a longer minimum interval', () => {
    const dense = new Array(60).fill(pairRate(10));
    expect(totalRate(dense)).toBe(ARC_BUDGET.maxAmbientRate);
    expect(totalRate(dense, 1, 4000)).toBe(0.25); // R10 handheld: half rate
    expect(totalRate(dense, 1, Infinity)).toBe(0);
    expect(totalRate([0.01, 0.02], 0.6)).toBeCloseTo(0.018, 10);
    expect(totalRate([])).toBe(0);
  });

  it('never schedules sooner than 1.2s, and never when Λ = 0', () => {
    const rand = mulberry32(1);
    for (let k = 0; k < 1000; k++) {
      expect(nextAmbientDelayMs(0.5, rand)).toBeGreaterThanOrEqual(ARC_BUDGET.minAmbientIntervalMs);
    }
    expect(nextAmbientDelayMs(0, rand)).toBe(Infinity);
  });

  it('averages about 1/Λ when the rate is low', () => {
    const rand = mulberry32(2);
    let sum = 0;
    const N = 20000;
    for (let k = 0; k < N; k++) sum += nextAmbientDelayMs(0.05, rand);
    expect(sum / N / 1000).toBeGreaterThan(19);
    expect(sum / N / 1000).toBeLessThan(21);
  });

  it('mode multiplier: fine 1, coarse 0.6, quiet 0', () => {
    expect(modeMultiplier('fine')).toBe(1);
    expect(modeMultiplier('coarse')).toBe(0.6);
    expect(modeMultiplier('fine', true)).toBe(0);
  });
});

describe('charge', () => {
  it('recharges as q + (1 − q)(1 − e^{−t/4s})', () => {
    expect(chargeAt(0, 0)).toBe(0);
    expect(chargeAt(0, 4000)).toBeCloseTo(1 - Math.exp(-1), 10);
    expect(chargeAt(0, 20000)).toBeCloseTo(1 - Math.exp(-5), 10);
    expect(chargeAt(0.4, 4000)).toBeCloseTo(0.4 + 0.6 * (1 - Math.exp(-1)), 10);
    expect(chargeAt(2, 100)).toBe(1);
  });

  it('gates pairs at 0.35 on both ends, and an arc drains 0.6', () => {
    expect(chargeEligible(0.35, 0.9)).toBe(true);
    expect(chargeEligible(0.34, 0.9)).toBe(false);
    expect(drainCharge(1)).toBeCloseTo(0.4, 10);
    expect(drainCharge(0.3)).toBe(0);
    expect(drainCharge(0.8, 1)).toBe(0);
    // A freshly drained element is not eligible again until it recharges (~1.8s from 0.4 → no; from 0 → ~1.7s).
    expect(chargeEligible(drainCharge(0.5), 1)).toBe(false);
  });
});

describe('pickWeighted', () => {
  it('returns -1 when nothing has weight', () => {
    expect(pickWeighted([], 0.5)).toBe(-1);
    expect(pickWeighted([0, -1, 0], 0.5)).toBe(-1);
  });

  it('never picks a zero-weight index', () => {
    const rand = mulberry32(4);
    for (let k = 0; k < 2000; k++) expect([1, 3]).toContain(pickWeighted([0, 2, 0, 1], rand()));
  });

  it('follows the weights (chi-square at a fixed seed)', () => {
    const weights = [1, 2, 3, 4];
    const total = 10;
    const N = 20000;
    const counts = [0, 0, 0, 0];
    const rand = mulberry32(123);
    for (let k = 0; k < N; k++) counts[pickWeighted(weights, rand())]++;
    let chi2 = 0;
    weights.forEach((w, i) => {
      const expected = (N * w) / total;
      chi2 += (counts[i] - expected) ** 2 / expected;
    });
    // 3 degrees of freedom, p = 0.001 critical value 16.27.
    expect(chi2).toBeLessThan(16.27);
  });
});

describe('click arcs', () => {
  it('throws 1 + (nearest < 60) + (third < 120 on fine pointers), capped at 3 / 2 on touch', () => {
    expect(clickBoltCount([], true)).toBe(0);
    expect(clickBoltCount([100], true)).toBe(1);
    expect(clickBoltCount([30], true)).toBe(1); // never more bolts than neighbours
    expect(clickBoltCount([30, 100], true)).toBe(2);
    expect(clickBoltCount([30, 50, 110], true)).toBe(3);
    expect(clickBoltCount([30, 50, 110], false)).toBe(2);
    expect(clickBoltCount([90, 100, 110], true)).toBe(2);
    expect(clickBoltCount([30, 50, 110], true, 1)).toBe(1); // handheld tier
  });

  it('weights targets by exp(−gap/L) inside the 180px radius', () => {
    expect(clickWeight(0)).toBe(1);
    expect(clickWeight(48)).toBeCloseTo(Math.exp(-1), 10);
    expect(clickWeight(181)).toBe(0);
  });
});
