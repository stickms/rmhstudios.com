/**
 * Build the loadout {@link Catalog} from the game's item schema.
 *
 * Pure: takes the text of `items_game.txt` and `tf_english.txt` and returns the
 * catalog, so the same code runs in the refresh job, the tests and any script.
 * It follows the schema's own rules rather than naming items — `prefab`
 * inheritance, per-class slot overrides in `used_by_classes`, equip regions and
 * their conflicts — so a game update changes the output, never this file.
 */

import { createHash } from 'node:crypto';
import { block, parseVdf, str, type VdfObject } from './vdf';
import {
  ITEM_SLOTS,
  RARITIES,
  TF_CLASSES,
  classBit,
  type Catalog,
  type CatalogEffect,
  type CatalogItem,
  type CatalogKit,
  type CatalogPaint,
  type ItemSlot,
  type Quality,
  type Rarity,
  type TfClass,
} from './catalog-types';

/**
 * Bump when the builder's output changes for the same schema (a new filter, a
 * new field): stored catalogs built by an older version are then rebuilt on the
 * next refresh instead of waiting for Valve to change the schema.
 */
export const BUILDER_VERSION = 6;

/** Identifies a schema *as this builder reads it*. */
export const schemaHash = (itemsGame: string): string =>
  createHash('sha1').update(`${BUILDER_VERSION}:`).update(itemsGame).digest('hex');

const WEAPON_SLOTS = new Set(['primary', 'secondary', 'melee', 'building', 'pda', 'pda2']);
const SLOT_SET = new Set<string>(ITEM_SLOTS);

const QUALITY_BY_NAME: Record<string, Quality> = {
  normal: 'normal',
  unique: 'unique',
  rarity1: 'genuine',
  vintage: 'vintage',
  rarity4: 'unusual',
  community: 'community',
  developer: 'valve',
  selfmade: 'selfmade',
  strange: 'strange',
  haunted: 'haunted',
  collectors: 'collectors',
  paintkitweapon: 'decorated',
};

/**
 * Prefab families that are not loadout choices: tournament medals (thousands of
 * near-identical event badges) and war-paint weapon skins (every stock weapon
 * again, once per paint kit). Matched on the prefab names an item lists itself.
 */
const EXCLUDED_PREFAB = /^(tournament_medal|paintkit_weapon)/;

/** Item `name` → tier, from the schema's collections (`items { <tier> { <item name> "10" } }`). */
function rarities(ig: VdfObject): Map<string, Rarity> {
  const out = new Map<string, Rarity>();
  const collections = block(ig, 'item_collections');
  for (const key of Object.keys(collections ?? {})) {
    const items = block(block(collections, key), 'items');
    for (const tier of Object.keys(items ?? {})) {
      const t = tier.toLowerCase() as Rarity;
      const group = block(items, tier);
      if (!group || !(RARITIES as readonly string[]).includes(t)) continue;
      for (const name of Object.keys(group)) out.set(name, t);
    }
  }
  return out;
}

/** Deep-merge `over` onto `base`: blocks merge key by key, strings replace. */
function merge(base: VdfObject, over: VdfObject): VdfObject {
  const out: VdfObject = Object.create(null);
  for (const k of Object.keys(base)) out[k] = base[k];
  for (const k of Object.keys(over)) {
    const a = out[k];
    const b = over[k];
    out[k] = typeof a === 'object' && typeof b === 'object' ? merge(a, b) : b;
  }
  return out;
}

/** An item with its `prefab` chain applied (later prefabs and the item's own keys win). */
function resolver(prefabs: VdfObject) {
  const cache = new Map<string, VdfObject>();
  const resolveNode = (node: VdfObject, depth: number): VdfObject => {
    const names = (str(node, 'prefab') ?? '').split(/\s+/).filter(Boolean);
    let acc: VdfObject = Object.create(null);
    if (depth < 8) {
      for (const name of names) {
        let p = cache.get(name);
        if (!p) {
          const raw = block(prefabs, name);
          p = raw ? resolveNode(raw, depth + 1) : Object.create(null);
          cache.set(name, p!);
        }
        acc = merge(acc, p!);
      }
    }
    return merge(acc, node);
  };
  return (node: VdfObject) => resolveNode(node, 0);
}

/** Tier, Halloween restriction and festivizable, as the schema marks them on an (already resolved) item. */
function flags(it: VdfObject, tiers: Map<string, Rarity>): Partial<CatalogItem> {
  const tier = tiers.get(str(it, 'name') ?? '');
  const holiday = (str(it, 'holiday_restriction') ?? '').toLowerCase();
  return {
    ...(tier ? { rt: tier } : {}),
    ...(holiday.includes('halloween') ? { hr: 1 as const } : {}),
    ...(str(block(it, 'tags'), 'can_be_festivized') === '1' ? { fz: 1 as const } : {}),
  };
}

function localiser(englishText: string) {
  const tokens = block(block(parseVdf(englishText), 'lang'), 'Tokens') ?? Object.create(null);
  const lower = new Map<string, string>();
  for (const k of Object.keys(tokens)) {
    const v = tokens[k];
    if (typeof v === 'string') lower.set(k.toLowerCase(), v);
  }
  return (token: string | undefined): string | undefined =>
    token ? lower.get(token.replace(/^#/, '').toLowerCase()) : undefined;
}

const hex = (n: number) => `#${(n & 0xffffff).toString(16).padStart(6, '0')}`;

/** Prefix of the prefab every war-painted weapon skin item uses: `paintkit_weapon_<weapon key>`. */
const PAINTKIT_PREFAB = 'paintkit_weapon_';

/** `tf_proto_obj_defs_english.txt`: the war paint names, keyed `9_<kit id>_field { field_number: 2 }`. */
function kitNames(protoEnglish: string | undefined): Map<number, string> {
  const names = new Map<number, string>();
  if (!protoEnglish) return names;
  const tokens = block(block(parseVdf(protoEnglish), 'lang'), 'Tokens');
  for (const key of Object.keys(tokens ?? {})) {
    const m = /^9_(\d+)_field \{ field_number: 2 \}$/.exec(key);
    const v = tokens?.[key];
    if (m && typeof v === 'string' && v.trim()) names.set(Number(m[1]), v.trim());
  }
  return names;
}

export interface BuildInput {
  itemsGame: string;
  english: string;
  /** War paint names; without them the catalog has no war paints. */
  protoEnglish?: string;
  label: string;
  /** Override the clock in tests. */
  now?: Date;
}

export function buildCatalog(input: BuildInput): Catalog {
  const ig = block(parseVdf(input.itemsGame), 'items_game');
  const items = block(ig, 'items');
  const prefabs = block(ig, 'prefabs');
  if (!ig || !items || !prefabs) throw new Error('items_game.txt is missing its items or prefabs');
  const loc = localiser(input.english);
  const resolve = resolver(prefabs);

  const out: CatalogItem[] = [];
  const paints: CatalogPaint[] = [];

  const stockIds = new Set<number>();
  // War paints: each war-painted weapon skin in the schema is one (kit, weapon) pair, and its name is the
  // name of the game's pattern script for it.
  const kitScripts = new Map<number, Record<string, string>>();
  const weaponKeys = new Map<number, string>();
  const tiers = rarities(ig);
  const skinItems: { id: number; key: string; kit: number; node: VdfObject }[] = [];
  for (const [idText, raw] of Object.entries(items)) {
    const id = Number(idText);
    if (!Number.isInteger(id) || typeof raw !== 'object') continue;
    const prefabNames = (str(raw, 'prefab') ?? '').split(/\s+/);
    const skin = prefabNames.find((p) => p.startsWith(PAINTKIT_PREFAB));
    if (skin) {
      const kit = Number(str(block(raw, 'static_attrs'), 'paintkit_proto_def_index'));
      const script = str(raw, 'name');
      if (Number.isInteger(kit) && kit > 0 && script) {
        (kitScripts.get(kit) ?? kitScripts.set(kit, {}).get(kit)!)[
          skin.slice(PAINTKIT_PREFAB.length)
        ] = script;
        skinItems.push({ id, key: skin.slice(PAINTKIT_PREFAB.length), kit, node: raw });
      }
      continue;
    }
    if (prefabNames.some((p) => EXCLUDED_PREFAB.test(p))) continue;
    const weaponPrefab = prefabNames.find((p) => /^weapon_./.test(p));
    if (weaponPrefab) weaponKeys.set(id, weaponPrefab.slice('weapon_'.length));
    const it = resolve(raw);
    const name = str(it, 'name') ?? '';

    // Paint cans: a tool with a tint attribute. (Halloween spells carry the same
    // attribute but are not paint, so the prefab has to say paint can.)
    const attrs = block(it, 'attributes');
    const tint = str(block(attrs, 'set item tint RGB'), 'value');
    const isPaintCan = (str(raw, 'prefab') ?? '')
      .split(/\s+/)
      .some((p) => p.startsWith('paint_can'));
    if (tint && isPaintCan && str(it, 'hidden') !== '1') {
      const n = loc(str(it, 'item_name'));
      const rgb2 = str(block(attrs, 'set item tint RGB 2'), 'value');
      if (n && !Number.isNaN(Number(tint))) {
        paints.push({
          id,
          n,
          rgb: hex(Number(tint)),
          ...(rgb2 && !Number.isNaN(Number(rgb2)) ? { rgb2: hex(Number(rgb2)) } : {}),
        });
      }
      continue;
    }

    const slot = str(it, 'item_slot') ?? '';
    if (!SLOT_SET.has(slot)) continue;
    // The schema keeps an "Upgradeable …" twin of every stock weapon for the stat-tracking system.
    if (name.startsWith('Upgradeable ')) continue;
    // Hidden items are normally internal. The exception is a class's stock weapon ("baseitem"), which
    // the game hides from the backpack but every class starts with — the builder's stock loadout needs it.
    const stock =
      str(it, 'hidden') === '1' && str(it, 'baseitem') === '1' && WEAPON_SLOTS.has(slot);
    if (str(it, 'hidden') === '1' && !stock) continue;
    const displayName = loc(str(it, 'item_name'));
    if (!displayName) continue;

    const used = block(it, 'used_by_classes');
    if (!used) continue;
    let mask = 0;
    let overrides: Partial<Record<TfClass, ItemSlot>> | undefined;
    for (const cls of TF_CLASSES) {
      const v = str(used, cls);
      if (!v || v === '0') continue;
      mask |= classBit(cls);
      if (SLOT_SET.has(v) && v !== slot) (overrides ??= {})[cls] = v as ItemSlot;
    }
    if (!mask) continue;

    const regionBlock = block(it, 'equip_regions');
    const regions = regionBlock
      ? Object.keys(regionBlock)
      : str(it, 'equip_region')
        ? [str(it, 'equip_region')!]
        : [];
    if (stock) stockIds.add(id);
    // Styles a player can choose (the schema also keeps ones only the game applies, marked not selectable).
    const styleBlock = block(block(it, 'visuals'), 'styles');
    const styles: { k: number; n: string }[] = [];
    if (styleBlock) {
      for (const key of Object.keys(styleBlock)) {
        const sb = block(styleBlock, key);
        const k = Number(key);
        if (!sb || !Number.isInteger(k) || str(sb, 'selectable') === '0') continue;
        styles.push({ k, n: loc(str(sb, 'name')) ?? `Style ${k + 1}` });
      }
    }
    const extra = flags(it, tiers);
    out.push({
      id,
      n: displayName,
      t: loc(str(it, 'item_type_name')) ?? '',
      q: QUALITY_BY_NAME[str(it, 'item_quality') ?? ''] ?? 'unique',
      s: slot as ItemSlot,
      c: mask,
      ...(overrides ? { o: overrides } : {}),
      ...((slot === 'head' || slot === 'misc') && regions.length ? { r: regions } : {}),
      ...(str(block(it, 'capabilities'), 'paintable') === '1' ? { p: 1 as const } : {}),
      ...(styles.length >= 2 ? { st: styles } : {}),
      ...extra,
    });
  }

  // A hidden stock weapon that a visible item of the same name already covers for every class that can
  // use it (the Scout's pistol is the same "Pistol" the Engineer has) would only show up twice.
  for (let i = out.length - 1; i >= 0; i--) {
    const it = out[i];
    if (!stockIds.has(it.id)) continue;
    const covered = TF_CLASSES.every((cls) => {
      if (!(it.c & classBit(cls))) return true;
      return out.some(
        (o) => o.id !== it.id && !stockIds.has(o.id) && o.n === it.n && (o.c & classBit(cls)) !== 0,
      );
    });
    if (covered) out.splice(i, 1);
  }

  // War paints the game names, and the weapons that can take them.
  const names = kitNames(input.protoEnglish);
  const kits: CatalogKit[] = [];
  const paintable = new Set<string>();
  for (const [kit, w] of kitScripts) {
    const n = names.get(kit);
    if (!n) continue;
    kits.push({ id: kit, n, w });
    for (const key of Object.keys(w)) paintable.add(key);
  }
  kits.sort((a, b) => a.n.localeCompare(b.n) || a.id - b.id);
  // Decorated weapons: a skin with its own item id is its base weapon painted with a fixed kit.
  for (const sk of skinItems) {
    const kitName = names.get(sk.kit);
    const base = out.find((o) => weaponKeys.get(o.id) === sk.key);
    if (!kitName || !base || !kits.some((k) => k.id === sk.kit)) continue;
    out.push({
      id: sk.id,
      n: `${kitName} ${base.n}`,
      t: base.t,
      q: 'decorated',
      s: base.s,
      c: base.c,
      ...(base.o ? { o: base.o } : {}),
      wk: sk.key,
      sk: { kit: sk.kit, base: base.id },
      ...flags(resolve(sk.node), tiers),
    });
  }
  for (const it of out) {
    const key = weaponKeys.get(it.id);
    if (
      key &&
      !it.sk &&
      paintable.has(key) &&
      (it.s === 'primary' || it.s === 'secondary' || it.s === 'melee')
    ) {
      it.wk = key;
    }
  }

  out.sort((a, b) => a.n.localeCompare(b.n) || a.id - b.id);
  paints.sort((a, b) => a.n.localeCompare(b.n));

  // Unusual effects the game names, for cosmetics and taunts.
  const particles = block(ig, 'attribute_controlled_attached_particles');
  const effects: CatalogEffect[] = [];
  const seen = new Set<number>();
  for (const group of ['cosmetic_unusual_effects', 'taunt_unusual_effects']) {
    const g = block(particles, group);
    if (!g) continue;
    for (const key of Object.keys(g)) {
      const eid = Number(key);
      const n = loc(`Attrib_Particle${key}`);
      if (!Number.isInteger(eid) || seen.has(eid) || !n || /^particle \d+$/i.test(n)) continue;
      seen.add(eid);
      effects.push({ id: eid, n });
    }
  }
  effects.sort((a, b) => a.n.localeCompare(b.n));

  // Equip conflicts, made symmetric.
  const conflicts: Record<string, string[]> = {};
  const cb = block(ig, 'equip_conflicts');
  for (const region of Object.keys(cb ?? {})) {
    for (const other of Object.keys(block(cb, region) ?? {})) {
      (conflicts[region] ??= []).push(other);
      (conflicts[other] ??= []).push(region);
    }
  }
  for (const k of Object.keys(conflicts)) conflicts[k] = [...new Set(conflicts[k])].sort();

  return {
    v: 1,
    source: {
      label: input.label,
      hash: schemaHash(input.itemsGame),
      builtAt: (input.now ?? new Date()).toISOString(),
      hasIcons: false,
    },
    items: out,
    paints,
    effects,
    ...(kits.length ? { kits } : {}),
    conflicts,
  };
}

/** Merge Steam Web API icon paths (defindex → path) into a catalog. */
export function applyIcons(catalog: Catalog, icons: ReadonlyMap<number, string>): Catalog {
  if (icons.size === 0) return catalog;
  return {
    ...catalog,
    source: { ...catalog.source, hasIcons: true },
    items: catalog.items.map((it) => {
      const i = icons.get(it.id);
      return i ? { ...it, i } : it;
    }),
  };
}
