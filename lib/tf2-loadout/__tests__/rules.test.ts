import { describe, expect, it } from 'vitest';
import { cosmeticSlotKeys, TF_CLASSES, type Catalog, type CatalogItem } from '../catalog-types';
import { legalize, loadoutWarnings, stockLoadout, STOCK_ITEMS } from '../rules';

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

  it('flags more than the game\'s three cosmetics', () => {
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

describe('legalize', () => {
  it('keeps what works and drops what the game would not allow, by slot order', () => {
    const { slots, dropped } = legalize(catalog, 'scout', {
      primary: { item: 13 },
      cosmetic1: { item: 100 },
      cosmetic2: { item: 101 }, // overlaps 100
      cosmetic3: { item: 102 },
      cosmetic4: { item: 103 },
      cosmetic5: { item: 104 }, // over the limit
      cosmetic6: { item: 100 }, // a repeat
    });
    expect(Object.keys(slots).sort()).toEqual(['cosmetic1', 'cosmetic2', 'cosmetic3', 'primary']);
    expect(slots.cosmetic2).toEqual({ item: 102 });
    expect(dropped.sort()).toEqual(['cosmetic2', 'cosmetic5', 'cosmetic6']);
    expect(loadoutWarnings(catalog, 'scout', slots)).toEqual([]);
  });
});
