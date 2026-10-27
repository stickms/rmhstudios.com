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
  TF_CLASSES,
  classBit,
  type Catalog,
  type CatalogEffect,
  type CatalogItem,
  type CatalogPaint,
  type ItemSlot,
  type Quality,
  type TfClass,
} from './catalog-types';

/**
 * Bump when the builder's output changes for the same schema (a new filter, a
 * new field): stored catalogs built by an older version are then rebuilt on the
 * next refresh instead of waiting for Valve to change the schema.
 */
export const BUILDER_VERSION = 2;

/** Identifies a schema *as this builder reads it*. */
export const schemaHash = (itemsGame: string): string =>
  createHash('sha1').update(`${BUILDER_VERSION}:`).update(itemsGame).digest('hex');

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

export interface BuildInput {
  itemsGame: string;
  english: string;
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

  for (const [idText, raw] of Object.entries(items)) {
    const id = Number(idText);
    if (!Number.isInteger(id) || typeof raw !== 'object') continue;
    if ((str(raw, 'prefab') ?? '').split(/\s+/).some((p) => EXCLUDED_PREFAB.test(p))) continue;
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
    if (name.startsWith('Upgradeable ') || str(it, 'hidden') === '1') continue;
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
    });
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
