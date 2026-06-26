import { describe, it, expect } from 'vitest';
import { serializeSave, parseSave, createNewSave, CURRENT_VERSION } from '../saveSystem';

describe('save serialization', () => {
  it('createNewSave returns version 1 starting state', () => {
    const s = createNewSave();
    expect(s.version).toBe(CURRENT_VERSION);
    expect(s.cash).toBeGreaterThan(0);
    expect(s.heat).toBe(0);
    expect(s.discoveredRecipes).toEqual([]);
  });
  it('round-trips through serialize/parse', () => {
    const s = createNewSave();
    s.cash = 999; s.discoveredRecipes = ['energizing+spicy'];
    const back = parseSave(serializeSave(s));
    expect(back).toEqual(s);
  });
  it('parseSave returns null for null/garbage', () => {
    expect(parseSave(null)).toBeNull();
    expect(parseSave('not json')).toBeNull();
  });
  it('parseSave rejects wrong version', () => {
    const bad = JSON.stringify({ version: 99, cash: 1, heat: 0, inventory: {}, discoveredRecipes: [] });
    expect(parseSave(bad)).toBeNull();
  });
  it('parseSave rejects missing required fields', () => {
    const bad = JSON.stringify({ version: 1, cash: 1 });
    expect(parseSave(bad)).toBeNull();
  });
});
