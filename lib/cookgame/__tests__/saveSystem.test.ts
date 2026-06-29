import { describe, it, expect } from 'vitest';
import { serializeSave, parseSave, createNewSave, CURRENT_VERSION } from '../saveSystem';
import { initialBuyerStates } from '../demand';

const validV2 = () => ({
  version: 2, cash: 150, heat: 0,
  inventory: { additives: {}, inputs: {}, baseStock: [], plots: [], dryingRack: [], workProduct: null, packaged: [] },
  discoveredRecipes: [],
});

describe('save v3', () => {
  it('createNewSave is v3 with defaulted Phase-3 fields', () => {
    const s = createNewSave();
    expect(s.version).toBe(CURRENT_VERSION);
    expect(CURRENT_VERSION).toBe(4);
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
    expect(parseSave(JSON.stringify({ ...createNewSave(), version: 5 }))).toBeNull();
  });
  it('rejects v3 with a bad new-field type', () => {
    const bad = { ...createNewSave(), keys: 'not-an-array' };
    expect(parseSave(JSON.stringify(bad))).toBeNull();
  });
});

describe('v2 -> v3 migration rejects bad v2 shape', () => {
  it('rejects when inventory.plots is not an array', () => {
    const bad = { ...validV2(), inventory: { ...validV2().inventory, plots: 'x' } };
    expect(parseSave(JSON.stringify(bad))).toBeNull();
  });
  it('rejects when inventory.baseStock is not an array', () => {
    const bad = { ...validV2(), inventory: { ...validV2().inventory, baseStock: 'x' } };
    expect(parseSave(JSON.stringify(bad))).toBeNull();
  });
  it('rejects when inventory.dryingRack is not an array', () => {
    const bad = { ...validV2(), inventory: { ...validV2().inventory, dryingRack: 'x' } };
    expect(parseSave(JSON.stringify(bad))).toBeNull();
  });
  it('rejects when inventory.inputs is null', () => {
    const bad = { ...validV2(), inventory: { ...validV2().inventory, inputs: null } };
    expect(parseSave(JSON.stringify(bad))).toBeNull();
  });
});

describe('v2 -> v3 migration', () => {
  it('upgrades a valid v2 save, defaulting the new fields and preserving the rest', () => {
    const v2 = { ...validV2(), cash: 999, discoveredRecipes: ['energizing'] };
    const out = parseSave(JSON.stringify(v2))!;
    expect(out.version).toBe(4);
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
  it('still chains a v1 save forward to v4', () => {
    const v1 = JSON.stringify({
      version: 1, cash: 200, heat: 5,
      inventory: { additives: { cuke: 1 }, rawBases: { greenstart: 2 }, workProduct: null, packaged: [] },
      discoveredRecipes: [],
    });
    const out = parseSave(v1)!;
    expect(out.version).toBe(4);
    expect(out.xp).toBe(0);
    expect(out.inventory.baseStock).toEqual([{ baseId: 'greenstart', qualityMult: 1, bonusEffects: [], units: 2 }]);
  });
});

describe('save v4 (buyerState)', () => {
  it('new save seeds buyerState for every buyer', () => {
    const s = createNewSave();
    expect(s.version).toBe(4);
    expect(s.buyerState).toEqual(initialBuyerStates());
  });

  it('migrates a v3 save by defaulting buyerState', () => {
    const v3 = { ...createNewSave(), version: 3 } as Record<string, unknown>;
    delete v3.buyerState;
    const out = parseSave(JSON.stringify(v3));
    expect(out).not.toBeNull();
    expect(out!.version).toBe(4);
    expect(out!.buyerState).toEqual(initialBuyerStates());
  });

  it('rejects a v4 save whose buyerState is not an object', () => {
    const bad = { ...createNewSave(), buyerState: [] as unknown };
    expect(parseSave(JSON.stringify(bad))).toBeNull();
  });
});
