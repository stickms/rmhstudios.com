import { describe, expect, it, vi } from 'vitest';
import { applyIcons, buildCatalog } from '../catalog-build';
import {
  iconUrl,
  itemsForSlot,
  regionsConflict,
  slotFor,
  weaponSlotsFor,
  type LoadoutSlots,
} from '../catalog-types';
import { validateSlots } from '../loadout.server';
import { parseVdf } from '../vdf';

vi.mock('@/lib/prisma.server', () => ({ prisma: {} }));
vi.mock('../catalog.server', () => ({ getCatalogObject: async () => null }));
vi.mock('@/lib/user-display', () => ({ userDisplaySelect: {}, resolveUser: () => ({}) }));

// A miniature items_game: a prefab chain, a class-specific slot override, an
// excluded medal, a paint can, cosmetics with conflicting regions, and effects.
const ITEMS_GAME = `
"items_game"
{
  "equip_conflicts" { "whole_head" { "hat" "1" "glasses" "1" } }
  "prefabs"
  {
    "valve" { "item_quality" "unique" }
    "weapon_base" { "prefab" "valve" "item_class" "tf_weapon" "item_slot" "primary" "item_type_name" "#T_Gun" }
    "base_hat" { "item_class" "tf_wearable" "item_slot" "head" "item_type_name" "#T_Hat" "capabilities" { "paintable" "1" } }
    "paint_can" { "attributes" { } }
    "tournament_medal" { "item_class" "tf_wearable" "item_slot" "misc" "item_type_name" "#T_Medal" }
  }
  "items"
  {
    "13" { "name" "Scattergun" "prefab" "weapon_base" "item_name" "#T_Scattergun" "used_by_classes" { "scout" "1" "engineer" "primary" } }
    "9"  { "name" "Shotgun" "prefab" "weapon_base" "item_name" "#T_Shotgun" "item_slot" "primary" "used_by_classes" { "soldier" "secondary" "engineer" "primary" } }
    "200" { "name" "Upgradeable Scattergun" "prefab" "weapon_base" "item_name" "#T_Scattergun" "used_by_classes" { "scout" "1" } }
    "940" { "name" "Gibus" "prefab" "base_hat" "item_name" "#T_Gibus" "equip_region" "hat" "used_by_classes" { "scout" "1" "spy" "1" } }
    "941" { "name" "Visor" "prefab" "base_hat" "item_name" "#T_Visor" "equip_region" "whole_head" "used_by_classes" { "scout" "1" } }
    "5030" { "name" "Paint Can 4" "prefab" "paint_can" "item_name" "#T_Paint4" "attributes" { "set item tint RGB" { "value" "14204632" } } }
    "9000" { "name" "A Medal" "prefab" "tournament_medal" "item_name" "#T_Medal1" "used_by_classes" { "scout" "1" } }
    "9001" { "name" "No Name" "prefab" "base_hat" "used_by_classes" { "scout" "1" } }
  }
  "attribute_controlled_attached_particles"
  {
    "cosmetic_unusual_effects" { "13" { "system" "a" } "14" { "system" "b" } }
  }
}`;

const ENGLISH = `
"lang" { "Language" "English" "Tokens"
{
  "T_Gun" "Weapon"  "T_Hat" "Hat"  "T_Scattergun" "Scattergun"  "T_Shotgun" "Shotgun"
  "T_Gibus" "Ghostly Gibus"  "T_Visor" "Visor"  "T_Paint4" "Team Spirit"  "T_Medal1" "Medal"
  "Attrib_Particle13" "Burning Flames"  "Attrib_Particle14" "Particle 14"
}}`;

const catalog = buildCatalog({
  itemsGame: ITEMS_GAME,
  english: ENGLISH,
  label: 'test',
  now: new Date('2026-01-01T00:00:00Z'),
});

describe('parseVdf', () => {
  it('reads nested blocks, comments, escapes and unquoted tokens', () => {
    const v = parseVdf('// hi\n"a" { "b" "x\\"y" c d\n "e" { "f" "1" } }');
    expect(v).toEqual({ a: { b: 'x"y', c: 'd', e: { f: '1' } } });
  });
  it('rejects an unterminated block', () => {
    expect(() => parseVdf('"a" { "b" "c"')).toThrow();
  });
});

describe('buildCatalog', () => {
  it('resolves prefabs and keeps only loadout items with names and classes', () => {
    const names = catalog.items.map((i) => i.n).sort();
    // Medals (excluded prefab), the Upgradeable twin and the unnamed hat are dropped.
    expect(names).toEqual(['Ghostly Gibus', 'Scattergun', 'Shotgun', 'Visor']);
    expect(catalog.items.find((i) => i.id === 13)).toMatchObject({ q: 'unique', t: 'Weapon' });
  });

  it('files an item under the slot each class overrides', () => {
    const shotgun = catalog.items.find((i) => i.id === 9)!;
    expect(slotFor(shotgun, 'soldier')).toBe('secondary');
    expect(slotFor(shotgun, 'engineer')).toBe('primary');
    expect(slotFor(shotgun, 'scout')).toBeNull();
    expect(weaponSlotsFor(catalog, 'soldier')).toEqual(['secondary']);
    expect(
      itemsForSlot(catalog, 'engineer', 'primary')
        .map((i) => i.id)
        .sort((a, b) => a - b),
    ).toEqual([9, 13]);
  });

  it('extracts paints, named effects and symmetric conflicts', () => {
    expect(catalog.paints).toEqual([{ id: 5030, n: 'Team Spirit', rgb: '#d8bed8' }]);
    expect(catalog.effects).toEqual([{ id: 13, n: 'Burning Flames' }]);
    expect(regionsConflict(['hat'], ['whole_head'], catalog.conflicts)).toBe(true);
    expect(regionsConflict(['whole_head'], ['glasses'], catalog.conflicts)).toBe(true);
    expect(regionsConflict(['hat'], ['glasses'], catalog.conflicts)).toBe(false);
  });

  it('hashes the schema and merges icon paths', () => {
    expect(catalog.source.hash).toMatch(/^[0-9a-f]{40}$/);
    const withIcons = applyIcons(catalog, new Map([[13, 'abc.png']]));
    expect(withIcons.source.hasIcons).toBe(true);
    expect(iconUrl(withIcons.items.find((i) => i.id === 13)!)).toMatch(
      /\/apps\/440\/icons\/abc\.png$/,
    );
    expect(applyIcons(catalog, new Map())).toBe(catalog);
  });
});

describe('validateSlots', () => {
  const ok: LoadoutSlots = {
    primary: { item: 13 },
    cosmetic1: { item: 940, paint: 5030, effect: 13 },
  };
  it('accepts a legal loadout', () => {
    expect(() => validateSlots(catalog, 'scout', ok)).not.toThrow();
  });
  it.each([
    ['an unknown item', { primary: { item: 1 } }],
    ['an item a class cannot use', { primary: { item: 9 } }],
    ['an item in the wrong slot', { melee: { item: 13 } }],
    ['an unknown paint', { cosmetic1: { item: 940, paint: 1 } }],
    ['paint on a weapon', { primary: { item: 13, paint: 5030 } }],
    ['an effect on a weapon', { primary: { item: 13, effect: 13 } }],
  ] as [string, LoadoutSlots][])('rejects %s', (_label, slots) => {
    expect(() => validateSlots(catalog, 'scout', slots)).toThrow();
  });

  // The builder lets players go past the game's rules (with a warning), so saving such a loadout works.
  it.each([
    ['overlapping cosmetics', { cosmetic1: { item: 940 }, cosmetic2: { item: 941 } }],
    ['the same cosmetic twice', { cosmetic1: { item: 940 }, cosmetic2: { item: 940 } }],
    ['more than three cosmetics', { cosmetic1: { item: 940 }, cosmetic4: { item: 941 } }],
  ] as [string, LoadoutSlots][])('accepts %s', (_label, slots) => {
    expect(() => validateSlots(catalog, 'scout', slots)).not.toThrow();
  });
});

describe('hidden stock weapons', () => {
  const items = `
"items_game"
{
  "prefabs" { "gun" { "item_class" "tf_weapon" "item_slot" "secondary" "item_type_name" "#T_Gun" } }
  "items"
  {
    "22" { "name" "TF_WEAPON_PISTOL" "prefab" "gun" "item_name" "#T_Pistol" "baseitem" "1" "used_by_classes" { "scout" "1" "engineer" "1" } }
    "23" { "name" "TF_WEAPON_PISTOL_SCOUT" "prefab" "gun" "item_name" "#T_Pistol" "hidden" "1" "baseitem" "1" "used_by_classes" { "scout" "1" } }
    "10" { "name" "TF_WEAPON_SHOTGUN_SOLDIER" "prefab" "gun" "item_name" "#T_Shotgun" "hidden" "1" "baseitem" "1" "used_by_classes" { "soldier" "1" } }
    "777" { "name" "Internal thing" "prefab" "gun" "item_name" "#T_Shotgun" "hidden" "1" "used_by_classes" { "soldier" "1" } }
  }
}`;
  const english = `"lang" { "Tokens" { "T_Gun" "Weapon" "T_Pistol" "Pistol" "T_Shotgun" "Shotgun" } }`;
  const cat = buildCatalog({ itemsGame: items, english, label: 't', now: new Date(0) });
  const ids = cat.items.map((i) => i.id).sort((a, b) => a - b);

  it("includes a class's hidden stock weapon so its stock loadout can be built", () => {
    expect(ids).toContain(10);
  });
  it('drops one a visible item of the same name already covers, so it is not listed twice', () => {
    expect(ids).toContain(22);
    expect(ids).not.toContain(23);
  });
  it('still hides internal items that are not stock weapons', () => {
    expect(ids).not.toContain(777);
  });
});
