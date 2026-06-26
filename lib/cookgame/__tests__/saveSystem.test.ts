import { describe, it, expect } from 'vitest';
import { serializeSave, parseSave, createNewSave, CURRENT_VERSION } from '../saveSystem';

describe('save v2', () => {
  it('createNewSave is version 2 with 3 empty plots and empty stock', () => {
    const s = createNewSave();
    expect(s.version).toBe(CURRENT_VERSION);
    expect(CURRENT_VERSION).toBe(2);
    expect(s.cash).toBe(150);
    expect(s.inventory.plots).toHaveLength(3);
    expect(s.inventory.plots.every((p) => p.stage === 'empty')).toBe(true);
    expect(s.inventory.baseStock).toEqual([]);
    expect(s.inventory.dryingRack).toEqual([]);
    expect(s.inventory.inputs).toEqual({});
  });
  it('round-trips through serialize/parse', () => {
    const s = createNewSave();
    s.cash = 999;
    s.inventory.baseStock = [{ baseId: 'couchlock', qualityMult: 1.3, bonusEffects: ['sedating'], units: 4 }];
    expect(parseSave(serializeSave(s))).toEqual(s);
  });
  it('rejects null/garbage/old-by-one-too-new', () => {
    expect(parseSave(null)).toBeNull();
    expect(parseSave('not json')).toBeNull();
    expect(parseSave(JSON.stringify({ version: 3, cash: 1, heat: 0, inventory: {}, discoveredRecipes: [] }))).toBeNull();
  });
});

describe('v2 inventory shape validation', () => {
  function baseValidV2() {
    return {
      version: 2,
      cash: 100,
      heat: 0,
      inventory: {
        additives: {},
        inputs: {},
        baseStock: [],
        plots: [],
        dryingRack: [],
        workProduct: null,
        packaged: [],
      },
      discoveredRecipes: [],
    };
  }

  it('accepts a complete valid v2 save (createNewSave round-trip already covered; also test baseValidV2)', () => {
    expect(parseSave(JSON.stringify(baseValidV2()))).not.toBeNull();
  });

  it('rejects v2 when plots is missing (undefined)', () => {
    const p = baseValidV2();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (p.inventory as any).plots;
    expect(parseSave(JSON.stringify(p))).toBeNull();
  });

  it('rejects v2 when plots is not an array', () => {
    const p = baseValidV2();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (p.inventory as any).plots = 'not-an-array';
    expect(parseSave(JSON.stringify(p))).toBeNull();
  });

  it('rejects v2 when baseStock is missing (undefined)', () => {
    const p = baseValidV2();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (p.inventory as any).baseStock;
    expect(parseSave(JSON.stringify(p))).toBeNull();
  });

  it('rejects v2 when baseStock is not an array', () => {
    const p = baseValidV2();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (p.inventory as any).baseStock = 42;
    expect(parseSave(JSON.stringify(p))).toBeNull();
  });

  it('rejects v2 when inputs is not an object', () => {
    const p = baseValidV2();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (p.inventory as any).inputs = [1, 2, 3];
    expect(parseSave(JSON.stringify(p))).toBeNull();
  });

  it('rejects v2 when inputs is null', () => {
    const p = baseValidV2();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (p.inventory as any).inputs = null;
    expect(parseSave(JSON.stringify(p))).toBeNull();
  });

  it('rejects v2 when additives is not an object (array)', () => {
    const p = baseValidV2();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (p.inventory as any).additives = [1, 2, 3];
    expect(parseSave(JSON.stringify(p))).toBeNull();
  });

  it('rejects v2 when dryingRack is not an array', () => {
    const p = baseValidV2();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (p.inventory as any).dryingRack = {};
    expect(parseSave(JSON.stringify(p))).toBeNull();
  });
});

describe('v1 -> v2 migration', () => {
  it('upgrades a valid v1 save: rawBases -> baseStock, adds plots/rack/inputs', () => {
    const v1 = JSON.stringify({
      version: 1, cash: 200, heat: 5,
      inventory: { additives: { cuke: 2 }, rawBases: { greenstart: 3 }, workProduct: null, packaged: [] },
      discoveredRecipes: ['energizing'],
    });
    const out = parseSave(v1)!;
    expect(out.version).toBe(2);
    expect(out.cash).toBe(200);
    expect(out.inventory.baseStock).toEqual([
      { baseId: 'greenstart', qualityMult: 1, bonusEffects: [], units: 3 },
    ]);
    expect(out.inventory.plots).toHaveLength(3);
    expect(out.inventory.inputs).toEqual({});
    expect(out.inventory.additives).toEqual({ cuke: 2 });
    expect(out.discoveredRecipes).toEqual(['energizing']);
  });
});
