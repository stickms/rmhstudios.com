import { describe, expect, it } from 'vitest';
import { cosmeticSlotKeys, TF_CLASSES, type Catalog, type CatalogItem } from '../catalog-types';
import {
  clashesWithWorn,
  equipInto,
  loadoutWarnings,
  stockLoadout,
  STOCK_ITEMS,
  withSupportedOptions,
} from '../rules';

const bit = (cls: (typeof TF_CLASSES)[number]) => 1 << TF_CLASSES.indexOf(cls);
const item = (id: number, over: Partial<CatalogItem>): CatalogItem => ({
  id,
  n: `Item ${id}`,
  t: 'x',
  q: 'unique',
  s: 'misc',
  c: 0b111111111,
  ...over,
});

const catalog: Catalog = {
  v: 1,
  source: { label: 't', hash: 'h', builtAt: '', hasIcons: false },
  items: [
    item(13, { s: 'primary', c: bit('scout') }),
    item(23, { s: 'secondary', c: bit('scout') }),
    item(0, { s: 'melee', c: bit('scout') }),
    // The Spy's revolver is a "primary" in the schema but sits in the secondary slot for him.
    item(24, { s: 'primary', c: bit('spy'), o: { spy: 'secondary' } }),
    item(4, { s: 'melee', c: bit('spy') }),
    item(100, { s: 'head', r: ['hat'] }),
    item(101, { s: 'head', r: ['whole_head'] }),
    item(102, { s: 'misc', r: ['face'] }),
    item(103, { s: 'misc', r: ['feet'] }),
    item(104, { s: 'misc', r: ['back'] }),
    item(105, { s: 'misc', c: bit('soldier'), r: ['back'] }),
  ],
  paints: [],
  effects: [],
  conflicts: { whole_head: ['hat', 'face'], hat: ['whole_head'], face: ['whole_head'] },
};

describe('stockLoadout', () => {
  it('gives a class its stock weapons in the right slots', () => {
    expect(stockLoadout(catalog, 'scout')).toEqual({
      primary: { item: 13 },
      secondary: { item: 23 },
      melee: { item: 0 },
    });
  });

  it("files a weapon under the slot the class uses it in (the Spy's revolver is a secondary)", () => {
    expect(stockLoadout(catalog, 'spy')).toEqual({ secondary: { item: 24 }, melee: { item: 4 } });
  });

  it('skips stock items the catalog does not have, and never equips a cosmetic', () => {
    expect(stockLoadout(catalog, 'medic')).toEqual({});
    for (const cls of TF_CLASSES) {
      const s = stockLoadout(catalog, cls);
      expect(Object.keys(s).some((k) => k.startsWith('cosmetic'))).toBe(false);
    }
  });

  it('lists stock items for every class', () => {
    for (const cls of TF_CLASSES) expect(STOCK_ITEMS[cls].length).toBeGreaterThanOrEqual(3);
  });
});

describe('loadoutWarnings', () => {
  it('is quiet for a legal loadout', () => {
    expect(
      loadoutWarnings(catalog, 'scout', {
        primary: { item: 13 },
        cosmetic1: { item: 100 },
        cosmetic2: { item: 102 },
        cosmetic3: { item: 103 },
      }),
    ).toEqual([]);
  });

  it('flags overlapping equip regions', () => {
    expect(
      loadoutWarnings(catalog, 'scout', { cosmetic1: { item: 100 }, cosmetic2: { item: 101 } }),
    ).toEqual([{ kind: 'overlap', a: 100, b: 101 }]);
  });

  it("flags more than the game's three cosmetics", () => {
    const w = loadoutWarnings(catalog, 'scout', {
      cosmetic1: { item: 100 },
      cosmetic2: { item: 102 },
      cosmetic3: { item: 103 },
      cosmetic4: { item: 104 },
    });
    expect(w).toEqual([{ kind: 'cosmetic-limit', count: 4, limit: 3 }]);
  });

  it('flags a repeated cosmetic and an item the class cannot use', () => {
    const w = loadoutWarnings(catalog, 'scout', {
      cosmetic1: { item: 100 },
      cosmetic2: { item: 100 },
      cosmetic3: { item: 105 },
    });
    expect(w).toContainEqual({ kind: 'duplicate', item: 100 });
    expect(w).toContainEqual({ kind: 'class', item: 105 });
  });
});

describe('cosmeticSlotKeys', () => {
  it("shows the game's three by default", () => {
    expect(cosmeticSlotKeys({})).toEqual(['cosmetic1', 'cosmetic2', 'cosmetic3']);
  });
  it('grows to hold what the loadout already uses, and is capped', () => {
    expect(cosmeticSlotKeys({ cosmetic5: {} })).toHaveLength(5);
    expect(cosmeticSlotKeys({ cosmetic99: {} })).toHaveLength(24);
  });
});

describe('clashesWithWorn', () => {
  const find = (id: number) => catalog.items.find((i) => i.id === id)!;

  it('flags an item overlapping, or repeating, one worn in another cosmetic slot', () => {
    const worn = { cosmetic1: { item: 100 } };
    expect(clashesWithWorn(catalog, worn, 'cosmetic2')(find(101))).toBe(true); // overlaps 100
    expect(clashesWithWorn(catalog, worn, 'cosmetic2')(find(100))).toBe(true); // a repeat
    expect(clashesWithWorn(catalog, worn, 'cosmetic2')(find(102))).toBe(false);
  });

  it('does not count the slot being filled, or anything that is not a cosmetic slot', () => {
    expect(clashesWithWorn(catalog, { cosmetic1: { item: 100 } }, 'cosmetic1')(find(101))).toBe(
      false,
    );
    expect(clashesWithWorn(catalog, { cosmetic1: { item: 100 } }, 'primary')(find(101))).toBe(
      false,
    );
  });
});

describe('equipInto', () => {
  const find = (id: number) => catalog.items.find((i) => i.id === id)!;

  it('takes out an overlapping cosmetic when the rules are on, and says which', () => {
    const r = equipInto(catalog, { cosmetic1: { item: 100 } }, 'cosmetic2', find(101), false);
    expect(r.slots).toEqual({ cosmetic2: { item: 101 } });
    expect(r.removed.map((i) => i.id)).toEqual([100]);
  });

  it('keeps everything when overlapping is allowed', () => {
    const r = equipInto(catalog, { cosmetic1: { item: 100 } }, 'cosmetic2', find(101), true);
    expect(Object.keys(r.slots)).toEqual(['cosmetic1', 'cosmetic2']);
    expect(r.removed).toEqual([]);
  });

  it('moves a repeated cosmetic instead of duplicating it (rules on)', () => {
    const r = equipInto(catalog, { cosmetic1: { item: 102 } }, 'cosmetic2', find(102), false);
    expect(r.slots).toEqual({ cosmetic2: { item: 102 } });
  });

  it('leaves weapons alone', () => {
    const r = equipInto(catalog, { primary: { item: 13 } }, 'melee', find(0), false);
    expect(r.slots).toEqual({ primary: { item: 13 }, melee: { item: 0 } });
  });
});

describe('withSupportedOptions', () => {
  const cat: Catalog = {
    ...catalog,
    items: [
      item(100, { s: 'head', p: 1 }),
      item(101, { s: 'head' }),
      item(102, { s: 'primary', fz: 1, wk: 'scattergun' }),
      item(103, { s: 'primary', wk: 'scattergun', sk: { kit: 5, base: 102 } }),
      item(104, {
        s: 'misc',
        st: [
          { k: 0, n: 'A' },
          { k: 1, n: 'B' },
        ],
      }),
    ],
    paints: [{ id: 7, n: 'Paint', rgb: '#ffffff' }],
    kits: [{ id: 5, n: 'Kit', w: { scattergun: 'script' } }],
  };

  it('drops a paint from an item that cannot be painted and keeps it on one that can', () => {
    const out = withSupportedOptions(cat, {
      cosmetic1: { item: 100, paint: 7 },
      cosmetic2: { item: 101, paint: 7 },
    });
    expect(out.cosmetic1.paint).toBe(7);
    expect(out.cosmetic2.paint).toBeUndefined();
  });

  it('drops an unknown paint, a missing style and an unsupported festive flag', () => {
    const out = withSupportedOptions(cat, {
      cosmetic1: { item: 100, paint: 99 },
      cosmetic2: { item: 104, style: 5 },
      primary: { item: 101, festive: true },
    });
    expect(out.cosmetic1.paint).toBeUndefined();
    expect(out.cosmetic2.style).toBeUndefined();
    expect(out.primary.festive).toBeUndefined();
    expect(
      withSupportedOptions(cat, { primary: { item: 102, festive: true } }).primary.festive,
    ).toBe(true);
  });

  it('keeps a decorated weapon wear and seed but not a kit of its own choosing', () => {
    const out = withSupportedOptions(cat, { primary: { item: 103, kit: 5, wear: 3, seed: 9 } });
    expect(out.primary).toEqual({ item: 103, wear: 3, seed: 9 });
  });

  it('returns the same object when nothing needs dropping', () => {
    const slots = { cosmetic1: { item: 100, paint: 7 } };
    expect(withSupportedOptions(cat, slots)).toBe(slots);
  });
});
