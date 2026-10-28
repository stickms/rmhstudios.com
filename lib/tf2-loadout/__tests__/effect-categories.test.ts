import { describe, expect, it, vi } from 'vitest';
import { buildCatalog } from '../catalog-build';
import { effectAppliesTo, effectsForItem, type Catalog, type CatalogItem } from '../catalog-types';
import { withSupportedOptions } from '../rules';
import { validateSlots } from '../loadout.server';
import { validateActions } from '../ai-core';

vi.mock('@/lib/prisma.server', () => ({ prisma: {} }));
vi.mock('../catalog.server', () => ({ getCatalogObject: async () => null }));
vi.mock('@/lib/user-display', () => ({ userDisplaySelect: {}, resolveUser: () => ({}) }));

const item = (id: number, s: CatalogItem['s'], ps?: string): CatalogItem => ({
  id,
  n: String(id),
  t: '',
  s,
  c: 1,
  q: 'unique',
  ...(ps ? { ps } : {}),
});
const hat = item(100, 'head'),
  misc = item(101, 'misc'),
  taunt = item(200, 'taunt');
const weapon = item(13, 'primary', 'scattergun'),
  tool = item(25, 'pda'),
  unsupportedWeapon = item(14, 'primary');
const catalog: Catalog = {
  v: 1,
  source: { label: '', hash: '', builtAt: '', hasIcons: false },
  items: [hat, misc, taunt, weapon, tool, unsupportedWeapon],
  paints: [],
  conflicts: {},
  effects: [
    { id: 13, n: 'Burning Flames', category: 'cosmetic' },
    { id: 3001, n: 'Showstopper', category: 'taunt' },
    { id: 701, n: 'Hot', category: 'weapon' },
  ],
};
describe('unusual effect families', () => {
  it('builds the three schema groups without guessing from names or IDs', () => {
    const result = buildCatalog({
      itemsGame:
        '"items_game" { "items" {} "prefabs" {} "attribute_controlled_attached_particles" { "cosmetic_unusual_effects" { "9" { "system" "cosmetic" } } "taunt_unusual_effects" { "2" { "system" "taunt" } } "weapon_unusual_effects" { "3" { "system" "weapon" } } } }',
      english:
        '"lang" { "Tokens" { "Attrib_Particle9" "Hat" "Attrib_Particle2" "Taunt" "Attrib_Particle3" "Gun" } }',
      label: 'test',
    });
    expect(
      result.effects.map((e) => [e.id, e.category]).sort((a, b) => Number(a[0]) - Number(b[0])),
    ).toEqual([
      [2, 'taunt'],
      [3, 'weapon'],
      [9, 'cosmetic'],
    ]);
  });
  it('shows only matching effects for the selected item', () => {
    expect(effectsForItem(catalog, hat, 'scout').map((e) => e.id)).toEqual([13]);
    expect(effectsForItem(catalog, misc, 'scout').map((e) => e.id)).toEqual([13]);
    expect(effectsForItem(catalog, taunt, 'scout').map((e) => e.id)).toEqual([3001]);
    expect(effectsForItem(catalog, weapon, 'scout').map((e) => e.id)).toEqual([701]);
    expect(effectsForItem(catalog, tool, 'scout')).toEqual([]);
    expect(effectsForItem(catalog, unsupportedWeapon, 'scout')).toEqual([]);
    expect(effectsForItem(catalog, hat, 'soldier')).toEqual([]);
    expect(effectAppliesTo(undefined, hat)).toBe(false);
  });
  it('rejects effects from another family when saving', () => {
    expect(() =>
      validateSlots(catalog, 'scout', {
        cosmetic1: { item: 100, effect: 13 },
        taunt1: { item: 200, effect: 3001 },
        primary: { item: 13, effect: 701 },
      }),
    ).not.toThrow();
    for (const [slot, id, effect] of [
      ['cosmetic1', 100, 3001],
      ['cosmetic1', 100, 701],
      ['taunt1', 200, 13],
      ['primary', 13, 3001],
      ['primary', 14, 701],
    ] as const) {
      expect(() => validateSlots(catalog, 'scout', { [slot]: { item: id, effect } })).toThrow(
        /cannot take that effect/,
      );
    }
  });
  it('cleans incompatible effects and placements from old drafts', () => {
    expect(
      withSupportedOptions(catalog, {
        cosmetic1: { item: 100, effect: 3001, fx: { y: 1 } },
        taunt1: { item: 200, effect: 3001 },
      }),
    ).toEqual({ cosmetic1: { item: 100 }, taunt1: { item: 200, effect: 3001 } });
  });
  it('applies the same filtering to AI-proposed equips', () => {
    const result = validateActions(
      catalog,
      'scout',
      [
        { item: 100, slot: 'cosmetic1', effect: 3001 },
        { item: 200, slot: 'taunt1', effect: 13 },
        { item: 13, slot: 'primary', effect: 701 },
      ],
      {},
    );
    expect(result.actions).toEqual([
      { item: 100, slot: 'cosmetic1' },
      { item: 200, slot: 'taunt1' },
      { item: 13, slot: 'primary', effect: 701 },
    ]);
  });
  it('retains saved effects if a failed schema upgrade serves an unclassified legacy catalog', () => {
    const legacy = { ...catalog, effects: [{ id: 13, n: 'Burning Flames' }] as Catalog['effects'] };
    const slots = { cosmetic1: { item: 100, effect: 13, fx: { y: 0.2 } } };
    expect(withSupportedOptions(legacy, slots)).toBe(slots);
  });
});
