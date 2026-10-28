import { describe, expect, it } from 'vitest';
import type { Catalog, CatalogItem } from '../catalog-types';
import { classBit } from '../catalog-types';
import { BACKPACK_SLOTS, sampleInventory } from '../sample';

const SCOUT = classBit('scout');
const item = (id: number, over: Partial<CatalogItem>): CatalogItem => ({
  id,
  n: `Item ${id}`,
  t: 'Item',
  q: 'unique',
  s: 'misc',
  c: SCOUT,
  ...over,
});

const catalog = {
  items: [
    item(1, { s: 'primary' }),
    item(2, { s: 'primary', q: 'strange' }),
    item(3, { s: 'secondary' }),
    item(4, { s: 'melee' }),
    ...Array.from({ length: 80 }, (_, i) => item(100 + i, { s: i % 2 ? 'head' : 'misc' })),
    item(900, { s: 'primary', c: classBit('soldier') }),
  ],
  paints: [],
  effects: [],
} as unknown as Catalog;

describe('sample inventory', () => {
  it('equips one weapon per slot and three cosmetics, all usable by the class', () => {
    const s = sampleInventory(catalog, 'scout');
    expect(s.slots.primary?.item).toBe(1);
    expect(s.slots.secondary?.item).toBe(3);
    expect(s.slots.melee?.item).toBe(4);
    expect(s.cosmeticKeys).toEqual(['cosmetic1', 'cosmetic2', 'cosmetic3']);
    expect(Object.keys(s.slots).filter((k) => k.startsWith('cosmetic'))).toHaveLength(3);
    for (const e of Object.values(s.slots)) expect(e.item).not.toBe(900);
  });

  it('fills one backpack page with items it is not already wearing, without repeats', () => {
    const s = sampleInventory(catalog, 'scout');
    const worn = new Set(Object.values(s.slots).map((e) => e.item));
    expect(s.backpack.length).toBe(BACKPACK_SLOTS);
    expect(new Set(s.backpack.map((i) => i.id)).size).toBe(s.backpack.length);
    expect(s.backpack.some((i) => worn.has(i.id))).toBe(false);
    expect(s.backpack.some((i) => i.id === 900)).toBe(false);
  });

  it('prefers items that have a model, and is deterministic', () => {
    const modelled = new Set([105, 107, 109]);
    const a = sampleInventory(catalog, 'scout', (id) => modelled.has(id));
    const b = sampleInventory(catalog, 'scout', (id) => modelled.has(id));
    expect(a).toEqual(b);
    const worn = Object.entries(a.slots)
      .filter(([k]) => k.startsWith('cosmetic'))
      .map(([, e]) => e.item);
    expect(worn.sort()).toEqual([105, 107, 109]);
  });

  it('copes with a class that has nothing', () => {
    const s = sampleInventory(catalog, 'spy');
    expect(s.slots).toEqual({});
    expect(s.backpack).toEqual([]);
  });
});
