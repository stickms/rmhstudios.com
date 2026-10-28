/** What the 3D player shows for a loadout: worn cosmetics, the held weapon, the taunt and its effect. */

import {
  TAUNT_KEYS,
  modelItemId,
  slotFor,
  effectAppliesTo,
  type LoadoutEntry,
  type LoadoutSlotKey,
  type LoadoutSlots,
  type TfClass,
} from '@/lib/tf2-loadout/catalog-types';
import { resolvePlacement } from '@/lib/tf2-loadout/fx';
import type { CatalogIndex } from '@/lib/tf2-loadout/use-catalog';
import { warPaintOf } from '@/lib/tf2-loadout/warpaint';
import type { WornItem } from './PlayerViewer';

/** The effect on an equipped item, ready to draw (undefined when it has none). */
export function effectSpecOf(
  idx: CatalogIndex,
  e: LoadoutEntry,
  slot: Parameters<typeof resolvePlacement>[1],
) {
  const fx = e.effect !== undefined ? idx.effect(e.effect) : undefined;
  const item = idx.item(e.item);
  return fx && item && effectAppliesTo(fx, item)
    ? { id: fx.id, suffix: item.ps, placement: resolvePlacement(e.fx, slot) }
    : undefined;
}

export type HeldSlot = 'primary' | 'secondary' | 'melee';

const HELD_SLOTS: readonly HeldSlot[] = ['primary', 'secondary', 'melee'];

export const isHeldSlot = (key: LoadoutSlotKey): key is HeldSlot =>
  (HELD_SLOTS as readonly string[]).includes(key);

/**
 * The cosmetics (with paint, style and effect), plus the one weapon the player holds: `held` when that
 * slot is filled, else the primary, else the secondary, else the melee.
 */
export function wornItems(
  idx: CatalogIndex,
  cls: TfClass,
  slots: LoadoutSlots,
  cosmeticKeys: readonly LoadoutSlotKey[],
  held: HeldSlot | null = null,
): WornItem[] {
  const out: WornItem[] = cosmeticKeys.flatMap((k) => {
    const e = slots[k];
    if (!e) return [];
    const it = idx.item(e.item);
    return [
      {
        slotKey: k,
        itemId: e.item,
        style: e.style,
        tint: it?.p && e.paint !== undefined ? idx.paint(e.paint)?.rgb : undefined,
        effect: effectSpecOf(idx, e, slotFor(idx.item(e.item)!, cls) ?? 'misc'),
      },
    ];
  });
  const heldKey = held && slots[held] ? held : HELD_SLOTS.find((k) => slots[k]);
  if (heldKey) {
    const e = slots[heldKey]!;
    out.push({
      slotKey: heldKey,
      itemId: modelItemId(idx.item(e.item) ?? { id: e.item }),
      paint: warPaintOf(idx, e),
      festive: e.festive,
      effect: effectSpecOf(idx, e, 'misc'),
    });
  }
  return out;
}

/** The first equipped taunt. */
export function tauntItemOf(slots: LoadoutSlots): number | undefined {
  for (const k of TAUNT_KEYS) if (slots[k]) return slots[k]!.item;
  return undefined;
}

/** The first equipped taunt's unusual effect, if any. */
export function tauntEffectOf(idx: CatalogIndex, slots: LoadoutSlots) {
  for (const k of TAUNT_KEYS) {
    const e = slots[k];
    const spec = e ? effectSpecOf(idx, e, 'taunt') : undefined;
    if (spec) return spec;
  }
  return undefined;
}
