/**
 * What the game allows, and what it gives you to start with. Pure and shared by the browser and
 * the server. The builder enforces the first by default and lets the player override it; nothing
 * here refuses a loadout — {@link loadoutWarnings} only says what would not work in the game.
 */

import {
  COSMETIC_SLOTS,
  acceptedSlots,
  regionsConflict,
  slotFor,
  effectAppliesTo,
  type Catalog,
  type CatalogItem,
  type ItemSlot,
  type LoadoutSlots,
  type TfClass,
} from './catalog-types';

/** Stock weapons and tools by defindex. Resolved against the catalog, so one it lacks is skipped. */
export const STOCK_ITEMS: Record<TfClass, readonly number[]> = {
  // The Scout's pistol is 23; where the catalog folds it into the Engineer's pistol (22) that one is used.
  scout: [13, 23, 22, 0],
  soldier: [18, 10, 6],
  pyro: [21, 12, 2],
  demoman: [19, 20, 1],
  heavy: [15, 11, 5],
  engineer: [9, 22, 7, 28, 25, 26],
  medic: [17, 29, 8],
  sniper: [14, 16, 3],
  spy: [24, 735, 4, 27, 30],
};

/** The loadout a class has in the game before anything is changed: its stock weapons, no cosmetics. */
export function stockLoadout(catalog: Catalog, cls: TfClass): LoadoutSlots {
  const byId = new Map(catalog.items.map((i) => [i.id, i]));
  const out: LoadoutSlots = {};
  for (const id of STOCK_ITEMS[cls]) {
    const item = byId.get(id);
    if (!item) continue;
    const slot: ItemSlot | null = slotFor(item, cls);
    if (!slot || !acceptedSlots(slot).includes(slot) || out[slot]) continue;
    out[slot] = { item: id };
  }
  return out;
}

export type LoadoutWarning =
  | { kind: 'cosmetic-limit'; count: number; limit: number }
  | { kind: 'overlap'; a: number; b: number }
  | { kind: 'duplicate'; item: number }
  | { kind: 'class'; item: number };

/** Everything in `slots` that could not be done in the game, in a stable order. */
export function loadoutWarnings(
  catalog: Catalog,
  cls: TfClass,
  slots: LoadoutSlots,
): LoadoutWarning[] {
  const byId = new Map(catalog.items.map((i) => [i.id, i]));
  const out: LoadoutWarning[] = [];

  const worn: { key: string; item: CatalogItem }[] = [];
  for (const [key, e] of Object.entries(slots)) {
    const item = byId.get(e.item);
    if (!item) continue;
    if (slotFor(item, cls) === null) out.push({ kind: 'class', item: item.id });
    if (key.startsWith('cosmetic')) worn.push({ key, item });
  }
  worn.sort((x, y) => Number(x.key.slice(8)) - Number(y.key.slice(8)));

  if (worn.length > COSMETIC_SLOTS) {
    out.push({ kind: 'cosmetic-limit', count: worn.length, limit: COSMETIC_SLOTS });
  }
  const seen = new Set<number>();
  for (const w of worn) {
    if (seen.has(w.item.id)) out.push({ kind: 'duplicate', item: w.item.id });
    seen.add(w.item.id);
  }
  for (let i = 0; i < worn.length; i++) {
    for (let j = i + 1; j < worn.length; j++) {
      if (worn[i].item.id === worn[j].item.id) continue;
      if (regionsConflict(worn[i].item.r, worn[j].item.r, catalog.conflicts)) {
        out.push({ kind: 'overlap', a: worn[i].item.id, b: worn[j].item.id });
      }
    }
  }
  return out;
}

/**
 * The same loadout, made playable in the game: only the first three cosmetics (by slot), none
 * that overlaps one already kept, none repeated, and nothing the class cannot use. Weapons are
 * untouched. Returns the keys it dropped so the caller can say what changed.
 */
export function legalize(
  catalog: Catalog,
  cls: TfClass,
  slots: LoadoutSlots,
): { slots: LoadoutSlots; dropped: string[] } {
  const byId = new Map(catalog.items.map((i) => [i.id, i]));
  const next: LoadoutSlots = {};
  const dropped: string[] = [];
  const kept: CatalogItem[] = [];
  const keys = Object.keys(slots).sort((a, b) => {
    const wa = a.startsWith('cosmetic') ? Number(a.slice(8)) : -1;
    const wb = b.startsWith('cosmetic') ? Number(b.slice(8)) : -1;
    return wa - wb;
  });
  for (const key of keys) {
    const e = slots[key];
    const item = byId.get(e.item);
    if (!item) continue;
    if (!key.startsWith('cosmetic')) {
      if (slotFor(item, cls) === null) dropped.push(key);
      else next[key] = e;
      continue;
    }
    const ok =
      slotFor(item, cls) !== null &&
      kept.length < COSMETIC_SLOTS &&
      !kept.some((k) => k.id === item.id || regionsConflict(k.r, item.r, catalog.conflicts));
    if (ok) {
      kept.push(item);
      // Renumbered, so the kept cosmetics fill the first slots instead of leaving gaps.
      next[`cosmetic${kept.length}`] = e;
    } else dropped.push(key);
  }
  return { slots: next, dropped };
}

/**
 * Put `item` in `key`. With the rules on (`unrestricted` false) it first takes out whatever the item
 * could not be worn with: the same item in another slot of its kind, or a cosmetic covering the same
 * part of the body. The caller says what was removed.
 */
export function equipInto(
  catalog: Catalog,
  slots: LoadoutSlots,
  key: string,
  item: CatalogItem,
  unrestricted: boolean,
): { slots: LoadoutSlots; removed: CatalogItem[] } {
  const next: LoadoutSlots = { ...slots };
  const removed: CatalogItem[] = [];
  const byId = new Map(catalog.items.map((i) => [i.id, i]));
  const isWorn = key.startsWith('cosmetic') || key.startsWith('taunt');
  if (!unrestricted) {
    for (const [k, e] of Object.entries(next)) {
      if (k === key) continue;
      const other = byId.get(e.item);
      const sameItem = isWorn && e.item === item.id && k.startsWith(key.replace(/\d+$/, ''));
      const overlaps =
        key.startsWith('cosmetic') &&
        k.startsWith('cosmetic') &&
        regionsConflict(item.r, other?.r, catalog.conflicts);
      if (sameItem || overlaps) {
        delete next[k];
        if (overlaps && other) removed.push(other);
      }
    }
  }
  next[key] = { item: item.id };
  return { slots: next, removed };
}

/**
 * A loadout with every option the item cannot take taken off: a paint on an item that is not
 * paintable, a style it does not have, a festive weapon that cannot be festivized, a war paint on
 * something that is not a paintable weapon. The server rejects these when saving; this keeps one that
 * arrives from an older save, a shared link or a draft from being shown (or re-saved) as if it worked.
 * Items the catalog no longer has are left alone. Returns the same object when nothing changed.
 */
export function withSupportedOptions(catalog: Catalog, slots: LoadoutSlots): LoadoutSlots {
  const byId = new Map(catalog.items.map((i) => [i.id, i]));
  const paints = new Set(catalog.paints.map((p) => p.id));
  const effects = new Map(catalog.effects.map((e) => [e.id, e]));
  const kits = new Map((catalog.kits ?? []).map((k) => [k.id, k]));
  let out: LoadoutSlots | null = null;
  for (const [key, entry] of Object.entries(slots)) {
    const item = byId.get(entry.item);
    if (!item) continue;
    const next = { ...entry };
    const effect = next.effect !== undefined ? effects.get(next.effect) : undefined;
    // Keep legacy draft data during a failed catalog upgrade until classification is available.
    if (
      next.effect !== undefined &&
      (!effect || (effect.category && !effectAppliesTo(effect, item)))
    ) {
      delete next.effect;
      delete next.fx;
    }
    if (next.paint !== undefined && !(item.p && paints.has(next.paint))) delete next.paint;
    if (next.style !== undefined && !item.st?.some((s) => s.k === next.style)) delete next.style;
    if (next.festive && !item.fz) delete next.festive;
    const kit = next.kit !== undefined ? kits.get(next.kit) : undefined;
    const kitOk = !item.sk && !!(kit && item.wk && kit.w[item.wk]);
    if (next.kit !== undefined && !kitOk) {
      delete next.kit;
      if (!item.sk) {
        delete next.wear;
        delete next.seed;
      }
    }
    if ((next.wear !== undefined || next.seed !== undefined) && !item.wk) {
      delete next.wear;
      delete next.seed;
    }
    if (Object.keys(next).length !== Object.keys(entry).length) (out ??= { ...slots })[key] = next;
  }
  return out ?? slots;
}
