import { describe, it, expect } from 'vitest';
import { DISTRICTS, isDistrictUnlocked } from '../districts';

describe('DISTRICTS', () => {
  it('has the four districts with the expected gates', () => {
    expect(DISTRICTS.suburbs.gate).toBeNull();
    expect(DISTRICTS.downtown.gate).toEqual({ type: 'rank', rank: 2 });
    expect(DISTRICTS.docks.gate).toEqual({ type: 'key', keyId: 'docks_key' });
    expect(DISTRICTS.warehouse.gate).toEqual({ type: 'rank', rank: 5 });
  });
});

describe('isDistrictUnlocked', () => {
  it('suburbs is always open', () => {
    expect(isDistrictUnlocked('suburbs', 0, [])).toBe(true);
  });
  it('rank gates open at/above their rank', () => {
    expect(isDistrictUnlocked('downtown', 1, [])).toBe(false);
    expect(isDistrictUnlocked('downtown', 2, [])).toBe(true);
    expect(isDistrictUnlocked('warehouse', 4, [])).toBe(false);
    expect(isDistrictUnlocked('warehouse', 5, [])).toBe(true);
  });
  it('key gates open only with the key', () => {
    expect(isDistrictUnlocked('docks', 9, [])).toBe(false);
    expect(isDistrictUnlocked('docks', 0, ['docks_key'])).toBe(true);
  });
  it('unknown district is locked', () => {
    expect(isDistrictUnlocked('atlantis', 9, ['docks_key'])).toBe(false);
  });
});
