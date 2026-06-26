import { describe, it, expect } from 'vitest';
import {
  qualityValueMult, qualityYield, qualityBonusEffects,
  BONUS_THRESHOLD, GROW_YIELD, COOK_YIELD,
} from '../production';

describe('qualityValueMult', () => {
  it('is 0.7 at q=0 and 1.3 at q=1', () => {
    expect(qualityValueMult(0)).toBeCloseTo(0.7, 5);
    expect(qualityValueMult(1)).toBeCloseTo(1.3, 5);
  });
  it('clamps out-of-range input', () => {
    expect(qualityValueMult(-5)).toBeCloseTo(0.7, 5);
    expect(qualityValueMult(5)).toBeCloseTo(1.3, 5);
  });
});

describe('qualityYield', () => {
  it('maps q across the range and rounds', () => {
    expect(qualityYield(0, GROW_YIELD)).toBe(3);
    expect(qualityYield(1, GROW_YIELD)).toBe(9);
    expect(qualityYield(0.5, GROW_YIELD)).toBe(6);
    expect(qualityYield(1, COOK_YIELD)).toBe(6);
  });
});

describe('qualityBonusEffects', () => {
  it('grants the base bonus effect at/above threshold', () => {
    expect(qualityBonusEffects('couchlock', BONUS_THRESHOLD)).toEqual(['sedating']);
    expect(qualityBonusEffects('glimmerdust', 1)).toEqual(['glowing']);
  });
  it('grants nothing below threshold', () => {
    expect(qualityBonusEffects('couchlock', BONUS_THRESHOLD - 0.01)).toEqual([]);
  });
  it('grants nothing for a base without a bonus effect', () => {
    expect(qualityBonusEffects('greenstart', 1)).toEqual([]);
  });
});
