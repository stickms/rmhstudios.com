/**
 * The loadout catalog's shape and the pure helpers both the browser and the
 * server use on it. The catalog itself is built from the game's own item
 * schema (`catalog-build.ts`) and refreshed automatically (`catalog.server.ts`);
 * nothing in here names a specific item, so a game update changes data, not code.
 */

export const TF_CLASSES = [
  'scout',
  'soldier',
  'pyro',
  'demoman',
  'heavy',
  'engineer',
  'medic',
  'sniper',
  'spy',
] as const;
export type TfClass = (typeof TF_CLASSES)[number];

/** The schema's `item_slot` values that make up a loadout. */
export const ITEM_SLOTS = [
  'primary',
  'secondary',
  'melee',
  'building',
  'pda',
  'pda2',
  'head',
  'misc',
  'taunt',
  'action',
] as const;
export type ItemSlot = (typeof ITEM_SLOTS)[number];

export const QUALITIES = [
  'normal',
  'unique',
  'genuine',
  'vintage',
  'unusual',
  'community',
  'valve',
  'selfmade',
  'strange',
  'haunted',
  'collectors',
  'decorated',
] as const;
export type Quality = (typeof QUALITIES)[number];

export interface CatalogItem {
  id: number;
  /** Display name. */
  n: string;
  /** Localised type line ("Scattergun", "Cosmetic", "Taunt"). */
  t: string;
  q: Quality;
  /** Slot for the classes that have no override in `o`. */
  s: ItemSlot;
  /** Bitmask of `TF_CLASSES` indices that can use the item. */
  c: number;
  /** Classes that file the item under a different slot (a shotgun is a primary for the Engineer only). */
  o?: Partial<Record<TfClass, ItemSlot>>;
  /** Cosmetic equip regions, for conflict checks. */
  r?: string[];
  /** Can be painted. */
  p?: 1;
  /**
   * The weapon pose the game holds it in (the schema's `anim_slot`), when that differs from its slot —
   * a weapon filed as a primary that is held like a secondary.
   */
  as?: HeldStance;
  /**
   * A taunt that keeps a weapon out: the slot the schema forces (`taunt_force_weapon_slot`). Every other
   * taunt holsters the player's weapon.
   */
  tw?: HeldStance;
  /** Inventory icon, relative to {@link ICON_BASE} (or an absolute URL). Present once the Steam schema has been merged. */
  i?: string;
  /** The styles a player can choose between (two or more), by the game's style key and name. */
  st?: { k: number; n: string }[];
  /** The weapon key a war paint is looked up by (`weapon_<key>` prefab), on weapons that can take one. */
  wk?: string;
  /** Schema particle suffix selecting this weapon's own unusual PCF variants. */
  ps?: string;
  /** The item's tier (the game's rarity: common … ancient), when a collection grades it. */
  rt?: Rarity;
  /** Only equippable around Halloween (the schema's `holiday_restriction`). */
  hr?: 1;
  /** A weapon that can be festivized. */
  fz?: 1;
  /**
   * A decorated weapon: a skin with its own item id, which is a stock weapon (`base`, whose model and
   * icon it uses) painted with a fixed kit. Unlike a war paint, the kit cannot be changed.
   */
  sk?: { kit: number; base: number };
}

/** The weapon poses the class bodies have a standing animation for (`stand_primary` …). */
export const HELD_STANCES = ['primary', 'secondary', 'melee'] as const;
export type HeldStance = (typeof HELD_STANCES)[number];

/** The game's item tiers, lowest to highest (named Civilian … Elite on weapons). */
export const RARITIES = ['common', 'uncommon', 'rare', 'mythical', 'legendary', 'ancient'] as const;
export type Rarity = (typeof RARITIES)[number];

export interface CatalogPaint {
  id: number;
  n: string;
  /** `#rrggbb`. */
  rgb: string;
  /** Second team colour for two-tone paints. */
  rgb2?: string;
}

export interface CatalogEffect {
  id: number;
  n: string;
  /** Source PCF system name, independent of the localized display name. */
  system?: string;
  category: 'cosmetic' | 'taunt' | 'weapon';
}

/** Effect eligibility is shared by the item picker, drafts, AI actions and save validation. */
export function effectCategory(
  item: CatalogItem,
  slot: ItemSlot | null = item.s,
): CatalogEffect['category'] | null {
  if (slot === 'head' || slot === 'misc') return 'cosmetic';
  if (slot === 'taunt') return 'taunt';
  if ((slot === 'primary' || slot === 'secondary' || slot === 'melee') && item.ps) return 'weapon';
  return null;
}
export function effectAppliesTo(
  effect: CatalogEffect | undefined,
  item: CatalogItem,
  slot: ItemSlot | null = item.s,
): boolean {
  return !!effect && effect.category === effectCategory(item, slot);
}
export function effectsForItem(
  catalog: Pick<Catalog, 'effects'>,
  item: CatalogItem,
  cls: TfClass,
): CatalogEffect[] {
  const slot = slotFor(item, cls);
  return slot ? catalog.effects.filter((effect) => effectAppliesTo(effect, item, slot)) : [];
}

/** A war paint: a pattern applied to a weapon, with a wear level and a seed (see {@link LoadoutEntry}). */
export interface CatalogKit {
  id: number;
  n: string;
  /** Weapon key (a weapon's `weapon_<key>` prefab) → the name of the game's pattern script for this kit on it. */
  w: Record<string, string>;
}

export interface Catalog {
  v: 1;
  source: {
    /** Where the schema came from ("SteamDatabase/GameTracking-TF2" or "Steam Web API"). */
    label: string;
    /** SHA-1 of the schema file, so a client can tell when it changed. */
    hash: string;
    builtAt: string;
    hasIcons: boolean;
  };
  items: CatalogItem[];
  paints: CatalogPaint[];
  /** Unusual effects for cosmetics and taunts. */
  effects: CatalogEffect[];
  /** War paints, when the game's data lists them. */
  kits?: CatalogKit[];
  /** Equip region → regions it cannot be worn with. Symmetric. */
  conflicts: Record<string, string[]>;
}

export const ICON_BASE = 'https://steamcdn-a.akamaihd.net/apps/440/icons/';

export function iconUrl(item: Pick<CatalogItem, 'i'>): string | null {
  if (!item.i) return null;
  return /^https?:\/\//.test(item.i) ? item.i : ICON_BASE + item.i;
}

/** The item whose model and icon stand for this one: a decorated weapon's base weapon, else itself. */
export const modelItemId = (item: Pick<CatalogItem, 'id' | 'sk'>): number =>
  item.sk?.base ?? item.id;

export const classBit = (cls: TfClass): number => 1 << TF_CLASSES.indexOf(cls);

export function usableBy(item: Pick<CatalogItem, 'c'>, cls: TfClass): boolean {
  return (item.c & classBit(cls)) !== 0;
}

/** The slot `cls` files `item` under, or null when the class cannot use it. */
export function slotFor(item: CatalogItem, cls: TfClass): ItemSlot | null {
  if (!usableBy(item, cls)) return null;
  return item.o?.[cls] ?? item.s;
}

/** True when two cosmetics occupy the same or conflicting equip regions. */
export function regionsConflict(
  a: readonly string[] | undefined,
  b: readonly string[] | undefined,
  conflicts: Catalog['conflicts'],
): boolean {
  if (!a?.length || !b?.length) return false;
  for (const x of a) for (const y of b) if (x === y || conflicts[x]?.includes(y)) return true;
  return false;
}

/* ───────────────────────────── loadout slots ───────────────────────────── */

/** What the game itself allows: three cosmetic slots. The builder can exceed it (with a warning). */
export const COSMETIC_SLOTS = 3;
/** The most cosmetic slots the builder offers. */
export const MAX_COSMETIC_SLOTS = 24;
export const TAUNT_SLOTS = 8;

/** Loadout slot keys, in display order. Weapon slots depend on the class (see {@link weaponSlotsFor}). */
export type LoadoutSlotKey = string;

export const cosmeticKey = (i: number): LoadoutSlotKey => `cosmetic${i + 1}`;
export const tauntKey = (i: number): LoadoutSlotKey => `taunt${i + 1}`;

export const COSMETIC_KEYS: LoadoutSlotKey[] = Array.from({ length: COSMETIC_SLOTS }, (_, i) =>
  cosmeticKey(i),
);
/**
 * The cosmetic slot keys to show: the game's three, plus however many more the loadout already
 * uses (so an over-full loadout shows everything it holds), capped at {@link MAX_COSMETIC_SLOTS}.
 */
export function cosmeticSlotKeys(
  slots: Record<string, unknown>,
  minimum = COSMETIC_SLOTS,
): LoadoutSlotKey[] {
  let highest = 0;
  for (const k of Object.keys(slots)) {
    const m = /^cosmetic(\d+)$/.exec(k);
    if (m) highest = Math.max(highest, Number(m[1]));
  }
  const n = Math.min(MAX_COSMETIC_SLOTS, Math.max(minimum, highest));
  return Array.from({ length: n }, (_, i) => cosmeticKey(i));
}

export const TAUNT_KEYS: LoadoutSlotKey[] = Array.from({ length: TAUNT_SLOTS }, (_, i) =>
  tauntKey(i),
);

/** The item slot a loadout slot accepts. Cosmetic slots take both hats and misc items. */
export function acceptedSlots(key: LoadoutSlotKey): ItemSlot[] {
  if (key.startsWith('cosmetic')) return ['head', 'misc'];
  if (key.startsWith('taunt')) return ['taunt'];
  return [key as ItemSlot];
}

const WEAPON_ORDER: ItemSlot[] = ['primary', 'secondary', 'melee', 'building', 'pda', 'pda2'];

/** Weapon-type slots a class actually has items for, in game order. */
export function weaponSlotsFor(catalog: Catalog, cls: TfClass): ItemSlot[] {
  const have = new Set<ItemSlot>();
  for (const item of catalog.items) {
    const s = slotFor(item, cls);
    if (s && WEAPON_ORDER.includes(s)) have.add(s);
  }
  return WEAPON_ORDER.filter((s) => have.has(s));
}

/** Every item that can go in `key` for `cls`. */
export function itemsForSlot(catalog: Catalog, cls: TfClass, key: LoadoutSlotKey): CatalogItem[] {
  const accepted = acceptedSlots(key);
  return catalog.items.filter((it) => {
    const s = slotFor(it, cls);
    return s !== null && accepted.includes(s);
  });
}

/* ───────────────────────────── loadout data ───────────────────────────── */

/** Optional offsets from the game's attachment, in fractions of the item's size, plus size scaling. */
export interface EffectPlacement {
  x?: number;
  y?: number;
  z?: number;
  /** Size multiplier. */
  s?: number;
}

/** War paint wear levels, best to worst, as the game numbers them. */
export const WEAR_LEVELS = [1, 2, 3, 4, 5] as const;
export const MAX_SEED = 999_999_999;

/** One equipped item. `paint`, `effect` and `kit` are catalog ids; `style` is a style key from the item. */
export interface LoadoutEntry {
  item: number;
  paint?: number;
  effect?: number;
  /** The unusual effect's placement; absent means the effect's default for this kind of item. */
  fx?: EffectPlacement;
  style?: number;
  /** War paint on a weapon: the kit, its wear (1 Factory New … 5 Battle Scarred) and pattern seed. */
  kit?: number;
  wear?: number;
  seed?: number;
  /** A festivized weapon (its lights are drawn on the model). */
  festive?: boolean;
}

export type LoadoutSlots = Record<LoadoutSlotKey, LoadoutEntry>;

/** Quality → CSS colour, the game's own palette (used on tile borders and names). */
export const QUALITY_COLOR: Record<Quality, string> = {
  normal: '#b2b2b2',
  unique: '#ffd700',
  genuine: '#4d7455',
  vintage: '#476291',
  unusual: '#8650ac',
  community: '#70b04a',
  valve: '#a50f79',
  selfmade: '#70b04a',
  strange: '#cf6a32',
  haunted: '#38f3ab',
  collectors: '#aa0000',
  decorated: '#fafafa',
};

/**
 * The colour to call attention to an item's quality with, or null for the two
 * plain qualities (Normal and Unique) — nearly every item is one of them, so
 * edging them all in gold would drown out the ones that are actually special.
 */
export function qualityAccent(q: Quality): string | null {
  return q === 'normal' || q === 'unique' ? null : QUALITY_COLOR[q];
}
