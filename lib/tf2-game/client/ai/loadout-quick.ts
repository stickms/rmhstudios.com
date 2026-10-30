/**
 * The in-game loadout quick bar's pure half: put the assistant's (catalog-validated) equips into a
 * class's loadout under the game's rules — the same `equipInto` a tap on an item tile uses, so a cosmetic
 * that shares an equip region replaces the old one instead of producing a loadout the match refuses.
 */

import { equipInto } from '@/lib/tf2-loadout/rules';
import type { AiAction } from '@/lib/tf2-loadout/ai-core';
import type { Catalog, LoadoutSlots } from '@/lib/tf2-loadout/catalog-types';

export function applyLoadoutActions(
  catalog: Catalog,
  slots: LoadoutSlots,
  actions: readonly AiAction[],
): { slots: LoadoutSlots; equipped: string[]; replaced: string[] } {
  const byId = new Map(catalog.items.map((i) => [i.id, i]));
  let next: LoadoutSlots = { ...slots };
  const equipped: string[] = [];
  const replaced: string[] = [];
  for (const a of actions) {
    const item = byId.get(a.item);
    if (!item) continue;
    const r = equipInto(catalog, next, a.slot, item, false);
    next = r.slots;
    replaced.push(...r.removed.map((x) => x.n));
    next[a.slot] = {
      item: item.id,
      ...(a.paint !== undefined ? { paint: a.paint } : {}),
      ...(a.effect !== undefined ? { effect: a.effect } : {}),
    };
    equipped.push(item.n);
  }
  return { slots: next, equipped, replaced };
}
