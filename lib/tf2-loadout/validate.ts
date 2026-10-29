/**
 * Checking a loadout against the catalog: the item exists, the class can use it, it fits the slot,
 * paint only on paintable items, effects only of the item's own family, styles it has, festive only on
 * festivizable weapons, war paints only on weapons that can take that kit. Pure, so the save route
 * (`loadout.server.ts` validateSlots) and the browser game's equip command (lib/tf2-game/sim/items)
 * refuse exactly the same loadouts. What the game additionally forbids (more than three cosmetics,
 * overlapping equip regions, a repeated cosmetic) is `loadoutWarnings` in rules.ts.
 */

import {
  acceptedSlots,
  effectAppliesTo,
  slotFor,
  type Catalog,
  type LoadoutSlots,
  type TfClass,
} from './catalog-types';

/** The first problem with `slots` for `tfClass`, as a sentence; null when every entry is valid. */
export function slotProblem(
  catalog: Catalog,
  tfClass: TfClass,
  slots: LoadoutSlots,
): string | null {
  const byId = new Map(catalog.items.map((i) => [i.id, i]));
  const paints = new Set(catalog.paints.map((p) => p.id));
  const effects = new Map(catalog.effects.map((e) => [e.id, e]));
  const kits = new Map((catalog.kits ?? []).map((k) => [k.id, k]));

  for (const [key, entry] of Object.entries(slots)) {
    const item = byId.get(entry.item);
    if (!item) return `Unknown item ${entry.item} in ${key}`;
    const slot = slotFor(item, tfClass);
    if (!slot || !acceptedSlots(key).includes(slot)) {
      return `${item.n} cannot go in ${key} for ${tfClass}`;
    }
    if (entry.paint !== undefined && (!item.p || !paints.has(entry.paint))) {
      return `${item.n} cannot take that paint`;
    }
    if (entry.effect !== undefined) {
      if (!effectAppliesTo(effects.get(entry.effect), item, slot)) {
        return `${item.n} cannot take that effect`;
      }
    }
    if (entry.fx !== undefined && entry.effect === undefined) {
      return `${item.n} has an effect placement but no effect`;
    }
    if (entry.style !== undefined && !item.st?.some((s) => s.k === entry.style)) {
      return `${item.n} has no such style`;
    }
    if (entry.festive && !item.fz) {
      return `${item.n} cannot be festivized`;
    }
    if (entry.kit !== undefined || entry.wear !== undefined || entry.seed !== undefined) {
      const warPaintable = slot === 'primary' || slot === 'secondary' || slot === 'melee';
      // A decorated weapon already has its kit; only its wear and seed are the player's to set.
      if (item.sk && entry.kit !== undefined) {
        return `${item.n} already has its own pattern`;
      }
      const kit = entry.kit !== undefined ? kits.get(entry.kit) : undefined;
      if (
        !warPaintable ||
        (!item.sk && entry.kit !== undefined && !(kit && item.wk && kit.w[item.wk]))
      ) {
        return `${item.n} cannot take that war paint`;
      }
    }
  }
  return null;
}
