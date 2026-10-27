/**
 * The loadout assistant's pure half, shared by the server route and the browser:
 *
 *  - {@link selectCandidates} picks which items the model is shown. The catalog has thousands of
 *    cosmetics and a prompt cannot list them all, so the player's own words choose the most
 *    relevant ones and a stable spread of the rest fills the list.
 *  - {@link validateActions} turns the model's answer into equips that are real: an unknown id, an
 *    item the class cannot use, a slot it does not fit or a paint it cannot take is dropped, never
 *    applied. Nothing the model says reaches a loadout without passing through here.
 *  - {@link heuristicSuggest} answers from the player's words alone, for when the model is
 *    unavailable.
 */

import {
  acceptedSlots,
  slotFor,
  usableBy,
  type Catalog,
  type CatalogItem,
  type ItemSlot,
  type LoadoutSlotKey,
  type LoadoutSlots,
  type TfClass,
} from './catalog-types';
import { MAX_COSMETIC_SLOTS, TAUNT_SLOTS } from './catalog-types';

export const ASSISTANT_LIMITS = {
  message: 500,
  history: 6,
  historyChars: 600,
  actions: 12,
} as const;

export interface AiAction {
  slot: LoadoutSlotKey;
  item: number;
  paint?: number;
  effect?: number;
}

const STOP = new Set([
  'the', 'and', 'for', 'with', 'that', 'this', 'make', 'give', 'want', 'some', 'like', 'please',
  'loadout', 'class', 'build', 'set', 'any', 'can', 'you', 'what', 'should', 'use', 'best', 'good',
  'cosmetic', 'cosmetics', 'weapon', 'weapons', 'items', 'item', 'wear', 'equip', 'theme', 'themed',
  'against', 'counter', 'team', 'enemy', 'from', 'about', 'something', 'suggest',
]);

export const wordsOf = (text: string): string[] =>
  [...new Set(text.toLowerCase().match(/[a-z0-9]{3,}/g) ?? [])].filter((w) => !STOP.has(w));

const score = (name: string, words: readonly string[]): number => {
  const n = name.toLowerCase();
  let s = 0;
  for (const w of words) if (n.includes(w)) s += n.split(/\W+/).includes(w) ? 3 : 2;
  return s;
};

/** A small stable hash, so the "spread" part of a list is the same on every call. */
const spread = (id: number): number => (Math.imul(id ^ 0x9e3779b9, 0x85ebca6b) >>> 0) / 4294967296;

export interface Candidates {
  weapons: CatalogItem[];
  cosmetics: CatalogItem[];
  taunts: CatalogItem[];
  paints: Catalog['paints'];
  effects: Catalog['effects'];
}

const WEAPON: ItemSlot[] = ['primary', 'secondary', 'melee', 'building', 'pda', 'pda2'];

function pick<T>(
  list: readonly T[],
  words: readonly string[],
  name: (t: T) => string,
  id: (t: T) => number,
  max: number,
): T[] {
  const ranked = list
    .map((t) => ({ t, s: score(name(t), words), r: spread(id(t)) }))
    .sort((a, b) => b.s - a.s || a.r - b.r);
  return ranked.slice(0, max).map((x) => x.t);
}

export function selectCandidates(catalog: Catalog, cls: TfClass, message: string): Candidates {
  const words = wordsOf(message);
  const usable = catalog.items.filter((i) => usableBy(i, cls));
  const slotOf = (i: CatalogItem): ItemSlot | null => slotFor(i, cls);
  return {
    weapons: pick(
      usable.filter((i) => WEAPON.includes(slotOf(i)!)),
      words,
      (i) => i.n,
      (i) => i.id,
      150,
    ),
    cosmetics: pick(
      usable.filter((i) => slotOf(i) === 'head' || slotOf(i) === 'misc'),
      words,
      (i) => i.n,
      (i) => i.id,
      240,
    ),
    taunts: pick(
      usable.filter((i) => slotOf(i) === 'taunt'),
      words,
      (i) => i.n,
      (i) => i.id,
      40,
    ),
    paints: catalog.paints,
    effects: pick(catalog.effects, words, (e) => e.n, (e) => e.id, 80),
  };
}

/** The item lists as the model reads them: one compact line per item. */
export function describeCandidates(c: Candidates, cls: TfClass): string {
  const line = (i: CatalogItem) =>
    `${i.id}|${i.n}|${slotFor(i, cls)}${i.r?.length ? `|${i.r.join(',')}` : ''}${i.p ? '|paintable' : ''}`;
  return [
    'WEAPONS (id|name|slot):',
    ...c.weapons.map(line),
    '',
    'COSMETICS (id|name|slot|equip regions):',
    ...c.cosmetics.map(line),
    '',
    'TAUNTS (id|name|slot):',
    ...c.taunts.map(line),
    '',
    'PAINTS (id|name):',
    ...c.paints.map((p) => `${p.id}|${p.n}`),
    '',
    'UNUSUAL EFFECTS (id|name):',
    ...c.effects.map((e) => `${e.id}|${e.n}`),
  ].join('\n');
}

/** The player's current loadout as text, for the model. */
export function describeLoadout(catalog: Catalog, slots: LoadoutSlots): string {
  const byId = new Map(catalog.items.map((i) => [i.id, i]));
  const rows = Object.entries(slots).map(([k, e]) => {
    const it = byId.get(e.item);
    const paint = e.paint !== undefined ? catalog.paints.find((p) => p.id === e.paint)?.n : undefined;
    const effect =
      e.effect !== undefined ? catalog.effects.find((x) => x.id === e.effect)?.n : undefined;
    return `${k}: ${it?.n ?? `#${e.item}`} (${e.item})${paint ? `, paint ${paint}` : ''}${effect ? `, effect ${effect}` : ''}`;
  });
  return rows.length ? rows.join('\n') : '(empty)';
}

const SLOT_KEY = /^(primary|secondary|melee|building|pda|pda2|action|cosmetic\d{1,2}|taunt[1-8])$/;

/**
 * Make the model's equips safe to apply. `current` is the loadout they will land in, so a missing
 * slot can be filled with the next free one rather than overwriting something.
 */
export function validateActions(
  catalog: Catalog,
  cls: TfClass,
  raw: unknown,
  current: LoadoutSlots,
): { actions: AiAction[]; dropped: number } {
  const byId = new Map(catalog.items.map((i) => [i.id, i]));
  const paints = new Set(catalog.paints.map((p) => p.id));
  const effects = new Set(catalog.effects.map((e) => e.id));
  const list = Array.isArray(raw) ? raw.slice(0, ASSISTANT_LIMITS.actions) : [];
  const used = new Set(Object.keys(current));
  const out = new Map<string, AiAction>();
  let dropped = 0;

  const free = (prefix: 'cosmetic' | 'taunt', max: number): string | null => {
    for (let n = 1; n <= max; n++) if (!used.has(`${prefix}${n}`)) return `${prefix}${n}`;
    return null;
  };

  for (const a of list) {
    const obj = (a ?? {}) as Record<string, unknown>;
    const id = typeof obj.item === 'number' ? obj.item : NaN;
    const item = Number.isInteger(id) ? byId.get(id) : undefined;
    const natural = item ? slotFor(item, cls) : null;
    if (!item || !natural) {
      dropped++;
      continue;
    }
    let slot = typeof obj.slot === 'string' && SLOT_KEY.test(obj.slot) ? obj.slot : null;
    if (slot && !acceptedSlots(slot).includes(natural)) slot = null;
    if (!slot) {
      slot =
        natural === 'head' || natural === 'misc'
          ? free('cosmetic', MAX_COSMETIC_SLOTS)
          : natural === 'taunt'
            ? free('taunt', TAUNT_SLOTS)
            : natural;
    }
    if (!slot) {
      dropped++;
      continue;
    }
    const action: AiAction = { slot, item: item.id };
    if (typeof obj.paint === 'number' && item.p && paints.has(obj.paint)) action.paint = obj.paint;
    if (
      typeof obj.effect === 'number' &&
      (natural === 'head' || natural === 'misc' || natural === 'taunt') &&
      effects.has(obj.effect)
    ) {
      action.effect = obj.effect;
    }
    used.add(slot);
    out.set(slot, action);
  }
  return { actions: [...out.values()], dropped };
}

/**
 * No model: the best name matches for what the player typed. Weapons fill their slots, then up to
 * three cosmetics that do not share an equip region. Empty when nothing matches.
 */
export function heuristicSuggest(
  catalog: Catalog,
  cls: TfClass,
  message: string,
  current: LoadoutSlots,
): { actions: AiAction[]; matched: string[] } {
  const words = wordsOf(message);
  if (!words.length) return { actions: [], matched: [] };
  const scored = catalog.items
    .filter((i) => usableBy(i, cls))
    .map((i) => ({ i, s: score(i.n, words), slot: slotFor(i, cls)! }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s || a.i.id - b.i.id);

  const picks: { i: CatalogItem; slot: ItemSlot }[] = [];
  const seenSlots = new Set<string>();
  const regions = new Set<string>();
  let cosmetics = 0;
  for (const x of scored) {
    if (x.slot === 'head' || x.slot === 'misc') {
      if (cosmetics >= 3) continue;
      if (x.i.r?.some((r) => regions.has(r))) continue;
      x.i.r?.forEach((r) => regions.add(r));
      cosmetics++;
      picks.push({ i: x.i, slot: x.slot });
    } else if (x.slot !== 'taunt' && !seenSlots.has(x.slot)) {
      seenSlots.add(x.slot);
      picks.push({ i: x.i, slot: x.slot });
    }
  }
  const raw = picks.map((p) => ({ item: p.i.id }));
  const { actions } = validateActions(catalog, cls, raw, current);
  const names = new Map(catalog.items.map((i) => [i.id, i.n]));
  return { actions, matched: actions.map((a) => names.get(a.item) ?? String(a.item)) };
}
