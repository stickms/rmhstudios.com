import { describe, it, expect } from 'vitest';
import { serializeSave, parseSave, createNewSave, CURRENT_VERSION } from '../saveSystem';

const validV2 = () => ({
  version: 2, cash: 150, heat: 0,
  inventory: { additives: {}, inputs: {}, baseStock: [], plots: [], dryingRack: [], workProduct: null, packaged: [] },
  discoveredRecipes: [],
});

describe('save v3', () => {
  it('createNewSave is v3 with defaulted Phase-3 fields', () => {
    const s = createNewSave();
    expect(s.version).toBe(CURRENT_VERSION);
    expect(CURRENT_VERSION).toBe(3);
    expect(s.xp).toBe(0);
    expect(s.ownedPropertyTier).toBe(0);
    expect(s.keys).toEqual([]);
    expect(s.clock).toBe(0);
    expect(s.discoveredEffects).toEqual([]);
    expect(s.recipeMeta).toEqual({});
    expect(s.currentDistrict).toBe('suburbs');
  });
  it('round-trips through serialize/parse', () => {
    const s = createNewSave();
    s.xp = 420; s.keys = ['docks']; s.currentDistrict = 'downtown';
    expect(parseSave(serializeSave(s))).toEqual(s);
  });
  it('rejects null/garbage/too-new', () => {
    expect(parseSave(null)).toBeNull();
    expect(parseSave('nope')).toBeNull();
    expect(parseSave(JSON.stringify({ ...createNewSave(), version: 4 }))).toBeNull();
  });
  it('rejects v3 with a bad new-field type', () => {
    const bad = { ...createNewSave(), keys: 'not-an-array' };
    expect(parseSave(JSON.stringify(bad))).toBeNull();
  });
});

describe('v2 -> v3 migration', () => {
  it('upgrades a valid v2 save, defaulting the new fields and preserving the rest', () => {
    const v2 = { ...validV2(), cash: 999, discoveredRecipes: ['energizing'] };
    const out = parseSave(JSON.stringify(v2))!;
    expect(out.version).toBe(3);
    expect(out.cash).toBe(999);
    expect(out.discoveredRecipes).toEqual(['energizing']);
    expect(out.xp).toBe(0);
    expect(out.ownedPropertyTier).toBe(0);
    expect(out.keys).toEqual([]);
    expect(out.clock).toBe(0);
    expect(out.discoveredEffects).toEqual([]);
    expect(out.recipeMeta).toEqual({});
    expect(out.currentDistrict).toBe('suburbs');
  });
  it('still chains a v1 save forward to v3', () => {
    const v1 = JSON.stringify({
      version: 1, cash: 200, heat: 5,
      inventory: { additives: { cuke: 1 }, rawBases: { greenstart: 2 }, workProduct: null, packaged: [] },
      discoveredRecipes: [],
    });
    const out = parseSave(v1)!;
    expect(out.version).toBe(3);
    expect(out.xp).toBe(0);
    expect(out.inventory.baseStock).toEqual([{ baseId: 'greenstart', qualityMult: 1, bonusEffects: [], units: 2 }]);
  });
});
