import { describe, it, expect } from 'vitest';
import {
  restockDemand, depleteDemand, demandPriceMult, reputationPriceMult,
  gainReputation, initialBuyerStates, RESTOCK_PER_MS, DEPLETE_PER_UNIT,
} from '../demand';
import { BUYERS } from '../content';

describe('restockDemand', () => {
  it('regenerates toward 1 and clamps', () => {
    expect(restockDemand(0, 1000)).toBeCloseTo(RESTOCK_PER_MS * 1000, 9);
    expect(restockDemand(1, 999999)).toBe(1);
    expect(restockDemand(0.9999, 100000)).toBe(1); // clamps, never above 1
  });
});

describe('depleteDemand', () => {
  it('drops by DEPLETE_PER_UNIT per unit and clamps at 0', () => {
    expect(depleteDemand(1, 1)).toBeCloseTo(1 - DEPLETE_PER_UNIT, 9);
    expect(depleteDemand(0.05, 3)).toBe(0);
  });
});

describe('demandPriceMult', () => {
  it('maps demand 0..1 to ~0.6..1.3', () => {
    expect(demandPriceMult(0)).toBeCloseTo(0.6, 9);
    expect(demandPriceMult(1)).toBeCloseTo(1.3, 9);
    expect(demandPriceMult(0.5)).toBeCloseTo(0.95, 9);
  });
});

describe('reputationPriceMult', () => {
  it('rises from 1.0 to 1.15', () => {
    expect(reputationPriceMult(0)).toBeCloseTo(1.0, 9);
    expect(reputationPriceMult(1)).toBeCloseTo(1.15, 9);
  });
});

describe('gainReputation', () => {
  it('adds and clamps to [0,1]', () => {
    expect(gainReputation(0.5, 0.02)).toBeCloseTo(0.52, 9);
    expect(gainReputation(0.99, 0.5)).toBe(1);
    expect(gainReputation(0.1, -0.5)).toBe(0);
  });
});

describe('initialBuyerStates', () => {
  it('seeds every buyer at full demand, zero rep, base preference', () => {
    const s = initialBuyerStates();
    expect(Object.keys(s).sort()).toEqual(BUYERS.map((b) => b.id).sort());
    for (const b of BUYERS) {
      expect(s[b.id]).toEqual({ demand: 1, reputation: 0, preferredEffect: b.preferredEffect });
    }
  });
});
