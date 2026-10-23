/**
 * The #989 charge laws (charge.ts): decay, the breakdown gap growing with charge, the hop floor, the ring delay and a
 * bounded Coulomb force.
 */
import { describe, expect, it } from 'vitest';

import { CHARGE } from '../../tiers';
import {
  attractEligible,
  breakdownGap,
  breaksDown,
  coulombForce,
  decayCharge,
  hopCarry,
  ringDelayMs,
} from '../charge';
import { createChargeBook } from '../scheduler';

describe('charge laws', () => {
  it('decays exponentially with CHARGE.decayMs and never leaves [0, 1]', () => {
    expect(decayCharge(1, 0)).toBe(1);
    expect(decayCharge(1, CHARGE.decayMs)).toBeCloseTo(Math.exp(-1), 6);
    expect(decayCharge(2, 0)).toBe(1);
    expect(decayCharge(-1, 100)).toBe(0);
  });

  it('the breakdown gap is breakdownGapPx · (1 + gain · q)', () => {
    expect(breakdownGap(0)).toBe(CHARGE.breakdownGapPx);
    expect(breakdownGap(1)).toBeCloseTo(
      CHARGE.breakdownGapPx * (1 + CHARGE.breakdownChargeGain),
      9,
    );
    expect(breakdownGap(0.5)).toBeGreaterThan(breakdownGap(0.25));
    // Layout puts bodies ≥ 16px apart: uncharged they never break down, charged they do.
    expect(breaksDown(16, 0, 0)).toBe(false);
    expect(breaksDown(16, 1, 0)).toBe(true);
    expect(breaksDown(8, 0, 0)).toBe(true);
    expect(breaksDown(0, 1, 1)).toBe(false);
  });

  it('a hop carries hopFraction of the charge, and none below minHopCharge', () => {
    expect(hopCarry(1)).toBeCloseTo(CHARGE.hopFraction, 9);
    expect(hopCarry(CHARGE.minHopCharge / CHARGE.hopFraction)).toBeCloseTo(CHARGE.minHopCharge, 9);
    expect(hopCarry((CHARGE.minHopCharge / CHARGE.hopFraction) * 0.99)).toBe(0);
  });

  it('the ring takes distance / pulseSpeedPxS to reach the rim', () => {
    expect(ringDelayMs(CHARGE.pulseSpeedPxS)).toBeCloseTo(1000, 9);
    expect(ringDelayMs(-5)).toBe(0);
  });

  it('Coulomb force scales with qa·qb and 1/gap², is clamped to 1 and ends at the reach', () => {
    const f = (g: number) => coulombForce(0.5, 0.5, g);
    const reach = CHARGE.attractReachPx;
    expect(f(reach)).toBeCloseTo(CHARGE.attractGain * 0.25, 9);
    expect(f(reach / 2)).toBeCloseTo(Math.min(1, 4 * f(reach)), 9);
    expect(coulombForce(1, 1, 1)).toBe(1);
    expect(coulombForce(1, 1, 0)).toBe(1);
    expect(f(reach + 1)).toBe(0);
    expect(coulombForce(1, 0, 10)).toBe(0);
    expect(attractEligible(0.3, 0.3)).toBe(true);
    expect(attractEligible(0.3, CHARGE.minHopCharge)).toBe(false);
  });
});

describe('the charge book (electric charge alongside readiness)', () => {
  const el = {} as Element;

  it('is 0 for a body never charged, adds clamped to 1 and decays lazily', () => {
    const book = createChargeBook();
    expect(book.electric(el, 0)).toBe(0);
    expect(book.get(el, 0)).toBe(1); // readiness is a separate quantity
    expect(book.deposit(el, 0.7, 0)).toBeCloseTo(0.7, 9);
    expect(book.deposit(el, 0.7, 0)).toBe(1);
    expect(book.electric(el, CHARGE.decayMs)).toBeCloseTo(Math.exp(-1), 6);
  });

  it('lists charged bodies and prunes the ones that have decayed away', () => {
    const book = createChargeBook();
    const other = {} as Element;
    book.deposit(el, 1, 0);
    book.deposit(other, 0.1, 0);
    expect(book.charged(0, CHARGE.minHopCharge)).toEqual([el]);
    expect(book.charged(0)).toHaveLength(2);
    expect(book.charged(CHARGE.decayMs * 10)).toEqual([]);
    expect(book.electric(el, CHARGE.decayMs * 10)).toBe(0);
  });
});
