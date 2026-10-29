/**
 * Loadouts in the game: checking one a player sends, turning it into what the
 * player is given (CTFPlayer::GiveDefaultItems over the class's loadout), and the
 * compact public form every client renders from.
 *
 * A loadout is the builder's own shape (lib/tf2-loadout/catalog-types.ts
 * `LoadoutSlots`). The game accepts exactly what the saved-loadout validation
 * accepts (`slotProblem`, lib/tf2-loadout/validate.ts) and, on top of it, the
 * game's own rules the builder only warns about (`loadoutWarnings`: the class can
 * use every item, at most three cosmetics, no repeated cosmetic, no overlapping
 * equip regions). Taunts are dropped (taunt items are not simulated) and so are
 * effect placement offsets (a builder preview setting).
 *
 * An empty weapon slot gets the class's stock item, as in the game.
 *
 * Environment-agnostic.
 */

import { CLASS_NAMES, TF_CLASS_COUNT } from '../../core/constants';
import {
  COSMETIC_SLOTS,
  TF_CLASSES,
  cosmeticKey,
  type Catalog,
  type LoadoutEntry,
  type LoadoutSlots,
  type TfClass,
} from '../../../tf2-loadout/catalog-types';
import { loadoutWarnings } from '../../../tf2-loadout/rules';
import { slotProblem } from '../../../tf2-loadout/validate';
import type { WeaponSpec } from '../weapon-api';
import { AttributeSet } from './attributes';
import { catalogItem } from './registry';
import { resolveItem, stockItemFor, type ItemPlay } from './resolve';

/** The loadout slot keys the game reads, in GiveDefaultItems order. */
export const GAME_WEAPON_KEYS = [
  'primary',
  'secondary',
  'melee',
  'pda',
  'pda2',
  'building',
] as const;
export const GAME_COSMETIC_KEYS = Array.from({ length: COSMETIC_SLOTS }, (_, i) => cosmeticKey(i));

/** Why an equip was refused (the client turns it into a message). */
export type LoadoutRefusal = 'no-catalog' | 'bad-class' | 'invalid' | 'rules';

export type LoadoutCheck =
  { ok: true; slots: LoadoutSlots } | { ok: false; reason: LoadoutRefusal; detail: string };

/** Class index → the catalog's class name (null for none / out of range). */
export function tfClassOf(classIndex: number): TfClass | null {
  if (classIndex <= 0 || classIndex >= TF_CLASS_COUNT) return null;
  const name = CLASS_NAMES[classIndex];
  return (TF_CLASSES as readonly string[]).includes(name) ? (name as TfClass) : null;
}

export function classIndexOf(cls: TfClass): number {
  return (CLASS_NAMES as readonly string[]).indexOf(cls);
}

/** Validates a loadout for a class against the catalog and the game's rules; returns it cleaned. */
export function checkGameLoadout(
  catalog: Catalog | null,
  cls: TfClass,
  slots: LoadoutSlots,
): LoadoutCheck {
  if (!catalog)
    return { ok: false, reason: 'no-catalog', detail: 'The item catalog is not available.' };
  if (!(TF_CLASSES as readonly string[]).includes(cls))
    return { ok: false, reason: 'bad-class', detail: cls };
  const clean: LoadoutSlots = {};
  for (const [key, entry] of Object.entries(slots)) {
    if (key.startsWith('taunt')) continue;
    const e: LoadoutEntry = { ...entry };
    delete e.fx;
    clean[key] = e;
  }
  const problem = slotProblem(catalog, cls, clean);
  if (problem) return { ok: false, reason: 'invalid', detail: problem };
  const warnings = loadoutWarnings(catalog, cls, clean);
  if (warnings.length)
    return { ok: false, reason: 'rules', detail: warnings.map((w) => w.kind).join(',') };
  // Cosmetics sit in cosmetic1…3 in the game; a valid loadout has at most three, renumbered in order.
  const cosmetics = Object.keys(clean)
    .filter((k) => k.startsWith('cosmetic'))
    .sort((a, b) => Number(a.slice(8)) - Number(b.slice(8)));
  const out: LoadoutSlots = {};
  for (const [key, entry] of Object.entries(clean))
    if (!key.startsWith('cosmetic')) out[key] = entry;
  cosmetics.forEach((k, i) => (out[cosmeticKey(i)] = clean[k]));
  return { ok: true, slots: out };
}

/** One weapon-slot item and what the player gets for it. */
export interface PlannedSlot {
  key: (typeof GAME_WEAPON_KEYS)[number];
  entry: LoadoutEntry;
  play: ItemPlay;
  /** The weapon created in its bucket (null: a worn item, or nothing). */
  spec: WeaponSpec | null;
}

export interface EquipPlan {
  slots: PlannedSlot[];
  /** Attribute sets of worn weapon-slot items (providers to the player). */
  worn: AttributeSet[];
  /** What everyone sees: weapon-slot items as equipped (a fallback shows its stock weapon), cosmetics. */
  items: ReplicatedItems;
}

/**
 * What a class is given for a loadout (undefined: the stock loadout). `specFor` builds a weapon
 * spec for a defindex (sim/loadout.ts weaponSpecFor), so stock items keep their own path.
 */
export function planLoadout(
  classIndex: number,
  slots: LoadoutSlots | undefined,
  specFor: (defindex: number, classIndex: number) => WeaponSpec | null,
): EquipPlan {
  const planned: PlannedSlot[] = [];
  const worn: AttributeSet[] = [];
  const items: ReplicatedItems = { weapons: [], cosmetics: [] };
  for (const key of GAME_WEAPON_KEYS) {
    const chosen = slots?.[key];
    const stock = stockItemFor(classIndex, key);
    const entry: LoadoutEntry | undefined =
      chosen ?? (stock !== undefined ? { item: stock } : undefined);
    if (!entry) continue;
    let play = resolveItem(entry.item, classIndex);
    if (!play && stock !== undefined && entry.item !== stock) play = resolveItem(stock, classIndex);
    if (!play) {
      // Not in the schema at all (no catalog yet and not a stock item): nothing for this slot.
      continue;
    }
    let spec: WeaponSpec | null = null;
    let shown: LoadoutEntry = entry;
    switch (play.kind) {
      case 'weapon':
        spec = specFor(entry.item, classIndex);
        break;
      case 'wearable':
        worn.push(new AttributeSet(play.attributes));
        break;
      case 'fallback':
        if (play.stockDefindex !== undefined) {
          spec = specFor(play.stockDefindex, classIndex);
          shown = { item: play.stockDefindex };
        }
        break;
      default:
        break;
    }
    planned.push({ key, entry, play, spec });
    items.weapons.push({
      slot: key,
      ...publicEntry(shown),
      ...(play.kind === 'wearable' ? { worn: true } : {}),
    });
  }
  for (const key of [...GAME_COSMETIC_KEYS, 'action']) {
    const e = slots?.[key];
    if (!e || !catalogItem(e.item)) continue;
    if (key === 'action') items.weapons.push({ slot: 'action', ...publicEntry(e) });
    else items.cosmetics.push(publicEntry(e));
  }
  return { slots: planned, worn, items };
}

/** What `planLoadout` reports per weapon slot, for the UI: which items are not (fully) simulated. */
export function loadoutSupport(
  classIndex: number,
  slots: LoadoutSlots,
): Array<{ key: string; item: number; unsupported: string[] }> {
  const out: Array<{ key: string; item: number; unsupported: string[] }> = [];
  for (const key of GAME_WEAPON_KEYS) {
    const e = slots[key];
    if (!e) continue;
    const play = resolveItem(e.item, classIndex);
    if (play && play.unsupported.length)
      out.push({ key, item: e.item, unsupported: play.unsupported });
  }
  return out;
}

// ─── The public form ─────────────────────────────────────────────────────────

/** A replicated item: what renderers need (paint, effect, style, festive, war paint). */
export interface PublicItem {
  item: number;
  style?: number;
  paint?: number;
  effect?: number;
  festive?: boolean;
  kit?: number;
  wear?: number;
  seed?: number;
}

export interface ReplicatedItems {
  /** Weapon-slot items (and the action item) by loadout slot; `worn` for a worn weapon-slot item. */
  weapons: Array<PublicItem & { slot: string; worn?: boolean }>;
  cosmetics: PublicItem[];
}

function publicEntry(e: LoadoutEntry): PublicItem {
  return {
    item: e.item,
    ...(e.style !== undefined ? { style: e.style } : {}),
    ...(e.paint !== undefined ? { paint: e.paint } : {}),
    ...(e.effect !== undefined ? { effect: e.effect } : {}),
    ...(e.festive ? { festive: true } : {}),
    ...(e.kit !== undefined ? { kit: e.kit } : {}),
    ...(e.wear !== undefined ? { wear: e.wear } : {}),
    ...(e.seed !== undefined ? { seed: e.seed } : {}),
  };
}

const SLOT_CODE: Record<string, string> = {
  primary: 'P',
  secondary: 'S',
  melee: 'M',
  pda: 'D',
  pda2: 'E',
  building: 'B',
  action: 'A',
};
const CODE_SLOT: Record<string, string> = Object.fromEntries(
  Object.entries(SLOT_CODE).map(([k, v]) => [v, k]),
);

function encodeItem(code: string, it: PublicItem, worn = false): string {
  let s = `${code}${it.item}`;
  if (worn) s += 'w';
  if (it.style !== undefined) s += `s${it.style}`;
  if (it.paint !== undefined) s += `p${it.paint}`;
  if (it.effect !== undefined) s += `e${it.effect}`;
  if (it.festive) s += 'f';
  if (it.kit !== undefined || it.wear !== undefined || it.seed !== undefined)
    s += `k${it.kit ?? 0}.${it.wear ?? 1}.${it.seed ?? 0}`;
  return s;
}

/**
 * The public form as one short string (a NET_PLAYER `items` field, delta-encoded like any other):
 * `/`-separated tokens `<slot code><defindex>[w][s<style>][p<paint>][e<effect>][f][k<kit>.<wear>.<seed>]`,
 * slot codes P S M D E B A for the weapon slots and the action item, C for a cosmetic. Only
 * identifier characters, so the match string table can intern it.
 */
export function encodeItems(items: ReplicatedItems): string {
  const parts: string[] = [];
  for (const w of items.weapons) {
    const code = SLOT_CODE[w.slot];
    if (code) parts.push(encodeItem(code, w, w.worn));
  }
  for (const c of items.cosmetics) parts.push(encodeItem('C', c));
  return parts.join('/');
}

const TOKEN =
  /^([PSMDEBAC])(\d+)(w?)(?:s(\d+))?(?:p(\d+))?(?:e(\d+))?(f?)(?:k(\d+)\.(\d+)\.(\d+))?$/;

export function decodeItems(s: string): ReplicatedItems {
  const out: ReplicatedItems = { weapons: [], cosmetics: [] };
  if (!s) return out;
  for (const tok of s.split('/')) {
    const m = TOKEN.exec(tok);
    if (!m) continue;
    const it: PublicItem = { item: Number(m[2]) };
    if (m[4] !== undefined) it.style = Number(m[4]);
    if (m[5] !== undefined) it.paint = Number(m[5]);
    if (m[6] !== undefined) it.effect = Number(m[6]);
    if (m[7]) it.festive = true;
    if (m[8] !== undefined) {
      it.kit = Number(m[8]);
      it.wear = Number(m[9]);
      it.seed = Number(m[10]);
    }
    if (m[1] === 'C') out.cosmetics.push(it);
    else out.weapons.push({ slot: CODE_SLOT[m[1]], ...it, ...(m[3] ? { worn: true } : {}) });
  }
  return out;
}

/** Worn weapon-slot items' attribute sets, from the public form (prediction rebuilds providers by it). */
export function wornAttributesOf(items: ReplicatedItems, classIndex: number): AttributeSet[] {
  const out: AttributeSet[] = [];
  for (const w of items.weapons) {
    if (!w.worn) continue;
    const play = resolveItem(w.item, classIndex);
    if (play?.kind === 'wearable') out.push(new AttributeSet(play.attributes));
  }
  return out;
}

let lastEncoded = '';
let lastDecoded: ReplicatedItems = { weapons: [], cosmetics: [] };

/** decodeItems with a one-entry cache, for callers that hold the same string frame after frame. */
export function decodeItemsCached(s: string): ReplicatedItems {
  if (s !== lastEncoded) {
    lastDecoded = decodeItems(s);
    lastEncoded = s;
  }
  return lastDecoded;
}
