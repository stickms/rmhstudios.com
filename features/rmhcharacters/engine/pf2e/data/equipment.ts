/**
 * PF2e Remaster equipment (Player Core): weapons, armor, shields and
 * adventuring gear. Bulk L is 0.1; negligible Bulk is 0.
 */
import type { Pf2eArmor, Pf2eGear, Pf2eWeapon } from '../../types';
import { kebab } from './dsl';

type W = [
  name: string,
  category: Pf2eWeapon['category'],
  kind: Pf2eWeapon['kind'],
  damage: string,
  type: Pf2eWeapon['damageType'],
  group: string,
  traits: string,
  hands: string,
  bulk: number,
  price: string,
  range?: number,
  reload?: string,
];

const L = 0.1;

const WEAPONS: W[] = [
  // Unarmed
  ['Fist', 'unarmed', 'melee', '1d4', 'B', 'brawling', 'agile, finesse, nonlethal, unarmed', '1', 0, '—'],
  // Simple melee
  ['Club', 'simple', 'melee', '1d6', 'B', 'club', 'thrown 10 ft.', '1', 1, '0 gp'],
  ['Dagger', 'simple', 'melee', '1d4', 'P', 'knife', 'agile, finesse, thrown 10 ft., versatile S', '1', L, '2 sp'],
  ['Gauntlet', 'simple', 'melee', '1d4', 'B', 'brawling', 'agile, free-hand', '1', L, '2 sp'],
  ['Light Mace', 'simple', 'melee', '1d4', 'B', 'club', 'agile, finesse, shove', '1', L, '4 sp'],
  ['Longspear', 'simple', 'melee', '1d8', 'P', 'spear', 'reach', '2', 2, '5 sp'],
  ['Mace', 'simple', 'melee', '1d6', 'B', 'club', 'shove', '1', 1, '1 gp'],
  ['Morningstar', 'simple', 'melee', '1d6', 'B', 'club', 'versatile P', '1', 1, '1 gp'],
  ['Sickle', 'simple', 'melee', '1d4', 'S', 'knife', 'agile, finesse, trip', '1', L, '2 sp'],
  ['Spear', 'simple', 'melee', '1d6', 'P', 'spear', 'thrown 20 ft.', '1', 1, '1 sp'],
  ['Spiked Gauntlet', 'simple', 'melee', '1d4', 'P', 'brawling', 'agile, free-hand', '1', L, '3 sp'],
  ['Staff', 'simple', 'melee', '1d4', 'B', 'club', 'two-hand d8', '1', 1, '0 gp'],
  ['Clan Dagger', 'simple', 'melee', '1d4', 'P', 'knife', 'agile, dwarf, parry, uncommon, versatile B', '1', L, '2 gp'],
  ['Katar', 'simple', 'melee', '1d4', 'P', 'knife', 'agile, deadly d6, monk, uncommon', '1', L, '3 sp'],
  // Simple ranged
  ['Crossbow', 'simple', 'ranged', '1d8', 'P', 'crossbow', '', '2', 1, '3 gp', 120, '1'],
  ['Dart', 'simple', 'ranged', '1d4', 'P', 'dart', 'agile, thrown', '1', L, '1 cp', 20, '0'],
  ['Hand Crossbow', 'simple', 'ranged', '1d6', 'P', 'crossbow', '', '1', L, '3 gp', 60, '1'],
  ['Heavy Crossbow', 'simple', 'ranged', '1d10', 'P', 'crossbow', '', '2', 2, '4 gp', 120, '2'],
  ['Javelin', 'simple', 'ranged', '1d6', 'P', 'dart', 'thrown', '1', L, '1 sp', 30, '0'],
  ['Sling', 'simple', 'ranged', '1d6', 'B', 'sling', 'propulsive', '1', L, '0 gp', 50, '1'],
  // Martial melee
  ['Bastard Sword', 'martial', 'melee', '1d8', 'S', 'sword', 'two-hand d12', '1', 1, '4 gp'],
  ['Battle Axe', 'martial', 'melee', '1d8', 'S', 'axe', 'sweep', '1', 1, '1 gp'],
  ['Bo Staff', 'martial', 'melee', '1d8', 'B', 'club', 'monk, parry, reach, trip', '2', 2, '2 sp'],
  ['Falchion', 'martial', 'melee', '1d10', 'S', 'sword', 'forceful, sweep', '2', 2, '3 gp'],
  ['Flail', 'martial', 'melee', '1d6', 'B', 'flail', 'disarm, sweep, trip', '1', 1, '8 sp'],
  ['Glaive', 'martial', 'melee', '1d8', 'S', 'polearm', 'deadly d8, forceful, reach', '2', 2, '1 gp'],
  ['Greataxe', 'martial', 'melee', '1d12', 'S', 'axe', 'sweep', '2', 2, '2 gp'],
  ['Greatclub', 'martial', 'melee', '1d10', 'B', 'club', 'backswing, shove', '2', 2, '1 gp'],
  ['Greatsword', 'martial', 'melee', '1d12', 'S', 'sword', 'versatile P', '2', 2, '2 gp'],
  ['Guisarme', 'martial', 'melee', '1d10', 'S', 'polearm', 'reach, trip', '2', 2, '2 gp'],
  ['Halberd', 'martial', 'melee', '1d10', 'P', 'polearm', 'reach, versatile S', '2', 2, '2 gp'],
  ['Hatchet', 'martial', 'melee', '1d6', 'S', 'axe', 'agile, sweep, thrown 10 ft.', '1', L, '4 sp'],
  ['Kama', 'martial', 'melee', '1d6', 'S', 'knife', 'agile, monk, trip', '1', L, '1 gp'],
  ['Kukri', 'martial', 'melee', '1d6', 'S', 'knife', 'agile, finesse, trip', '1', L, '6 sp'],
  ['Lance', 'martial', 'melee', '1d8', 'P', 'spear', 'deadly d8, jousting d6, reach', '2', 2, '1 gp'],
  ['Light Hammer', 'martial', 'melee', '1d6', 'B', 'hammer', 'agile, thrown 20 ft.', '1', L, '3 sp'],
  ['Light Pick', 'martial', 'melee', '1d4', 'P', 'pick', 'agile, fatal d8', '1', L, '4 sp'],
  ['Longsword', 'martial', 'melee', '1d8', 'S', 'sword', 'versatile P', '1', 1, '1 gp'],
  ['Main-Gauche', 'martial', 'melee', '1d4', 'P', 'knife', 'agile, disarm, finesse, parry, versatile S', '1', L, '5 sp'],
  ['Maul', 'martial', 'melee', '1d12', 'B', 'hammer', 'shove', '2', 2, '3 gp'],
  ['Nunchaku', 'martial', 'melee', '1d6', 'B', 'flail', 'backswing, disarm, finesse, monk', '1', L, '2 sp'],
  ['Pick', 'martial', 'melee', '1d6', 'P', 'pick', 'fatal d10', '1', 1, '7 sp'],
  ['Ranseur', 'martial', 'melee', '1d10', 'P', 'polearm', 'disarm, reach', '2', 2, '2 gp'],
  ['Rapier', 'martial', 'melee', '1d6', 'P', 'sword', 'deadly d8, disarm, finesse', '1', 1, '2 gp'],
  ['Sap', 'martial', 'melee', '1d6', 'B', 'club', 'agile, nonlethal', '1', L, '1 sp'],
  ['Scimitar', 'martial', 'melee', '1d6', 'S', 'sword', 'forceful, sweep', '1', 1, '1 gp'],
  ['Scythe', 'martial', 'melee', '1d10', 'S', 'polearm', 'deadly d10, trip', '2', 2, '2 gp'],
  ['Shield Bash', 'martial', 'melee', '1d4', 'B', 'shield', '', '1', 0, '—'],
  ['Shield Boss', 'martial', 'melee', '1d6', 'B', 'shield', 'attached to shield', '1', 0, '5 sp'],
  ['Shield Spikes', 'martial', 'melee', '1d6', 'P', 'shield', 'attached to shield', '1', 0, '5 sp'],
  ['Shortsword', 'martial', 'melee', '1d6', 'P', 'sword', 'agile, finesse, versatile S', '1', L, '9 sp'],
  ['Starknife', 'martial', 'melee', '1d4', 'P', 'knife', 'agile, deadly d6, finesse, thrown 20 ft.', '1', L, '2 gp'],
  ['Temple Sword', 'martial', 'melee', '1d8', 'S', 'sword', 'monk, trip', '1', 1, '2 gp'],
  ['Trident', 'martial', 'melee', '1d8', 'P', 'spear', 'thrown 20 ft.', '1', 1, '1 gp'],
  ['War Flail', 'martial', 'melee', '1d10', 'B', 'flail', 'disarm, sweep, trip', '2', 2, '2 gp'],
  ['Warhammer', 'martial', 'melee', '1d8', 'B', 'hammer', 'shove', '1', 1, '1 gp'],
  ['Whip', 'martial', 'melee', '1d4', 'S', 'flail', 'disarm, finesse, nonlethal, reach, trip', '1', 1, '1 sp'],
  ['Dogslicer', 'martial', 'melee', '1d6', 'S', 'sword', 'agile, backstabber, finesse, goblin, uncommon', '1', L, '1 sp'],
  ['Elven Curve Blade', 'martial', 'melee', '1d8', 'S', 'sword', 'elf, finesse, forceful, uncommon', '2', 2, '4 gp'],
  ['Filcher’s Fork', 'martial', 'melee', '1d4', 'P', 'spear', 'agile, backstabber, finesse, halfling, thrown 20 ft., uncommon', '1', L, '1 gp'],
  ['Gnome Hooked Hammer', 'martial', 'melee', '1d6', 'B', 'hammer', 'gnome, trip, two-hand d10, uncommon, versatile P', '1', 1, '2 gp'],
  ['Horsechopper', 'martial', 'melee', '1d8', 'S', 'polearm', 'goblin, reach, trip, uncommon, versatile P', '2', 2, '9 sp'],
  ['Orc Knuckle Dagger', 'martial', 'melee', '1d6', 'P', 'knife', 'agile, disarm, orc, uncommon', '1', L, '7 sp'],
  ['Orc Necksplitter', 'martial', 'melee', '1d8', 'S', 'axe', 'forceful, orc, sweep, uncommon', '1', 1, '2 gp'],
  // Martial ranged
  ['Composite Longbow', 'martial', 'ranged', '1d8', 'P', 'bow', 'deadly d10, propulsive, volley 30 ft.', '1+', 2, '20 gp', 100, '0'],
  ['Composite Shortbow', 'martial', 'ranged', '1d6', 'P', 'bow', 'deadly d10, propulsive', '1+', 1, '14 gp', 60, '0'],
  ['Longbow', 'martial', 'ranged', '1d8', 'P', 'bow', 'deadly d10, volley 30 ft.', '1+', 2, '6 gp', 100, '0'],
  ['Shortbow', 'martial', 'ranged', '1d6', 'P', 'bow', 'deadly d10', '1+', 1, '3 gp', 60, '0'],
  ['Shuriken', 'martial', 'ranged', '1d4', 'P', 'dart', 'agile, monk, thrown, uncommon', '1', 0, '1 cp', 20, '0'],
  ['Halfling Sling Staff', 'martial', 'ranged', '1d10', 'B', 'sling', 'halfling, propulsive, uncommon', '2', 1, '5 gp', 80, '1'],
  // Advanced melee
  ['Dwarven Waraxe', 'advanced', 'melee', '1d8', 'S', 'axe', 'dwarf, sweep, two-hand d12, uncommon', '1', 2, '3 gp'],
  ['Gnome Flickmace', 'advanced', 'melee', '1d8', 'B', 'flail', 'gnome, reach, uncommon', '1', 1, '3 gp'],
  ['Sawtooth Saber', 'advanced', 'melee', '1d6', 'S', 'sword', 'agile, finesse, twin, uncommon', '1', L, '5 gp'],
  ['Spiked Chain', 'advanced', 'melee', '1d8', 'S', 'flail', 'disarm, finesse, trip, uncommon', '2', 1, '3 gp'],
];

export const PF2E_WEAPONS: Pf2eWeapon[] = WEAPONS.map(
  ([name, category, kind, damage, damageType, group, traits, hands, bulk, price, range, reload]) => {
    const w: Pf2eWeapon = {
      id: kebab(name),
      name,
      category,
      kind,
      damage,
      damageType,
      group,
      traits: traits ? traits.split(',').map((t) => t.trim()) : [],
      hands,
      bulk,
      price,
    };
    if (range !== undefined) w.range = range;
    if (reload !== undefined) w.reload = reload;
    return w;
  },
);

const armor = (a: Omit<Pf2eArmor, 'id'>): Pf2eArmor => ({ id: kebab(a.name), ...a });

export const PF2E_ARMOR: Pf2eArmor[] = [
  armor({ name: 'No Armor', category: 'unarmored', acBonus: 0, checkPenalty: 0, speedPenalty: 0, traits: [], bulk: 0, price: '—' }),
  armor({ name: 'Explorer’s Clothing', category: 'unarmored', acBonus: 0, dexCap: 5, checkPenalty: 0, speedPenalty: 0, group: 'cloth', traits: ['comfort'], bulk: L, price: '1 sp' }),
  armor({ name: 'Padded Armor', category: 'light', acBonus: 1, dexCap: 3, checkPenalty: 0, speedPenalty: 0, strength: 0, group: 'cloth', traits: ['comfort'], bulk: L, price: '2 sp' }),
  armor({ name: 'Leather Armor', category: 'light', acBonus: 1, dexCap: 4, checkPenalty: -1, speedPenalty: 0, strength: 0, group: 'leather', traits: [], bulk: 1, price: '2 gp' }),
  armor({ name: 'Studded Leather Armor', category: 'light', acBonus: 2, dexCap: 3, checkPenalty: -1, speedPenalty: 0, strength: 1, group: 'leather', traits: [], bulk: 1, price: '3 gp' }),
  armor({ name: 'Chain Shirt', category: 'light', acBonus: 2, dexCap: 3, checkPenalty: -1, speedPenalty: 0, strength: 1, group: 'chain', traits: ['flexible', 'noisy'], bulk: 1, price: '5 gp' }),
  armor({ name: 'Hide Armor', category: 'medium', acBonus: 3, dexCap: 2, checkPenalty: -2, speedPenalty: -5, strength: 2, group: 'leather', traits: [], bulk: 2, price: '2 gp' }),
  armor({ name: 'Scale Mail', category: 'medium', acBonus: 3, dexCap: 2, checkPenalty: -2, speedPenalty: -5, strength: 2, group: 'composite', traits: [], bulk: 2, price: '4 gp' }),
  armor({ name: 'Chain Mail', category: 'medium', acBonus: 4, dexCap: 1, checkPenalty: -2, speedPenalty: -5, strength: 3, group: 'chain', traits: ['flexible', 'noisy'], bulk: 2, price: '6 gp' }),
  armor({ name: 'Breastplate', category: 'medium', acBonus: 4, dexCap: 1, checkPenalty: -2, speedPenalty: -5, strength: 3, group: 'plate', traits: [], bulk: 2, price: '8 gp' }),
  armor({ name: 'Splint Mail', category: 'heavy', acBonus: 5, dexCap: 1, checkPenalty: -3, speedPenalty: -10, strength: 3, group: 'composite', traits: [], bulk: 3, price: '13 gp' }),
  armor({ name: 'Half Plate', category: 'heavy', acBonus: 5, dexCap: 1, checkPenalty: -3, speedPenalty: -10, strength: 3, group: 'plate', traits: [], bulk: 3, price: '18 gp' }),
  armor({ name: 'Full Plate', category: 'heavy', acBonus: 6, dexCap: 0, checkPenalty: -3, speedPenalty: -10, strength: 4, group: 'plate', traits: ['bulwark'], bulk: 4, price: '30 gp' }),
  armor({ name: 'Buckler', category: 'shield', acBonus: 1, checkPenalty: 0, speedPenalty: 0, traits: [], hardness: 3, hpMax: 6, bulk: L, price: '1 gp' }),
  armor({ name: 'Wooden Shield', category: 'shield', acBonus: 2, checkPenalty: 0, speedPenalty: 0, traits: [], hardness: 3, hpMax: 12, bulk: 1, price: '1 gp' }),
  armor({ name: 'Steel Shield', category: 'shield', acBonus: 2, checkPenalty: 0, speedPenalty: 0, traits: [], hardness: 5, hpMax: 20, bulk: 1, price: '2 gp' }),
  armor({ name: 'Tower Shield', category: 'shield', acBonus: 2, checkPenalty: 0, speedPenalty: -5, traits: [], hardness: 5, hpMax: 20, bulk: 4, price: '10 gp' }),
];

const g = (name: string, bulk: number, price: string, text?: string): Pf2eGear => {
  const item: Pf2eGear = { id: kebab(name), name, bulk, price };
  if (text) item.text = text;
  return item;
};

export const PF2E_GEAR: Pf2eGear[] = [
  g('Adventurer’s Pack', 1, '7 sp', 'Backpack, bedroll, 10 pieces of chalk, flint and steel, 50 feet of rope, 2 weeks of rations, soap, 5 torches and a waterskin.'),
  g('Alchemist’s Toolkit', 1, '3 gp', 'Needed to Craft alchemical items.'),
  g('Arrows (10)', L, '1 sp'),
  g('Artisan’s Toolkit', 2, '4 gp', 'Needed to Craft most items.'),
  g('Backpack', L, '1 sp', 'The first 2 Bulk inside does not count against your limit.'),
  g('Bedroll', L, '1 cp'),
  g('Bolts (10)', L, '1 sp'),
  g('Caltrops', L, '3 sp', 'Scatter in a square to damage creatures that move into it.'),
  g('Candle (10)', 0, '1 cp', 'Dim light in a 10-foot radius for 8 hours.'),
  g('Chain (10 feet)', 1, '4 sp'),
  g('Chalk (10 pieces)', 0, '1 cp'),
  g('Climbing Kit', 1, '5 sp', '+1 item bonus to Climb.'),
  g('Compass', L, '1 gp', '+1 item bonus to Sense Direction.'),
  g('Cookware', 2, '1 gp'),
  g('Crowbar', L, '5 sp', '+1 item bonus to Force Open with leverage.'),
  g('Disguise Kit', L, '2 gp', 'Needed to Impersonate without a penalty.'),
  g('Flint and Steel', 0, '5 cp'),
  g('Grappling Hook', L, '1 sp'),
  g('Hammer', L, '1 sp'),
  g('Healer’s Toolkit', 1, '5 gp', 'Needed for Administer First Aid, Treat Disease, Treat Poison and Treat Wounds.'),
  g('Holy Water', L, '3 gp', 'Splash weapon that deals spirit damage to unholy creatures.'),
  g('Hooded Lantern', L, '7 sp', 'Bright light in a 30-foot radius; can be shuttered.'),
  g('Bull’s-Eye Lantern', 1, '1 gp', 'Bright light in a 60-foot cone.'),
  g('Lock (simple)', L, '2 sp'),
  g('Manacles (simple)', 0, '3 sp'),
  g('Mirror', 0, '1 gp'),
  g('Musical Instrument (handheld)', 1, '8 sp'),
  g('Oil (1 pint)', L, '1 cp', 'Fuels a lantern for 6 hours.'),
  g('Piton', 0, '1 cp'),
  g('Rations (1 week)', L, '4 sp'),
  g('Religious Symbol (wooden)', L, '1 sp', 'Divine focus for some divine spellcasters.'),
  g('Religious Text', L, '1 gp'),
  g('Repair Toolkit', 1, '2 gp', 'Needed to Repair items.'),
  g('Rope (50 feet)', L, '5 sp'),
  g('Sack', L, '1 cp'),
  g('Sling Bullets (10)', L, '1 cp'),
  g('Soap', 0, '2 cp'),
  g('Spellbook (blank)', 1, '1 gp'),
  g('Formula Book (blank)', 1, '1 gp'),
  g('Tent (pup)', L, '8 sp'),
  g('Thieves’ Toolkit', L, '3 gp', 'Needed to Pick a Lock or Disable a Device of some types.'),
  g('Torch', L, '1 cp', 'Bright light in a 20-foot radius for 1 hour.'),
  g('Waterskin', L, '5 cp'),
  g('Writing Set', L, '1 gp'),
  g('Minor Healing Potion', L, '4 gp', 'Drink to regain 1d8 Hit Points.'),
  g('Lesser Antidote', L, '3 gp', '+2 item bonus to Fortitude saves against poison for 6 hours.'),
];
