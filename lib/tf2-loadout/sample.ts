/**
 * A plausible inventory to show a class with: the weapons it carries, three cosmetics and a backpack of
 * other usable items. Pure and deterministic (same catalog, same answer), so a HUD previewed twice looks
 * the same twice. The HUD editor uses it to fill item panels without the author building a loadout first.
 */

import {
  COSMETIC_KEYS,
  itemsForSlot,
  type CatalogItem,
  type Catalog,
  type LoadoutSlotKey,
  type LoadoutSlots,
  type TfClass,
} from './catalog-types';

export interface SampleInventory {
  slots: LoadoutSlots;
  cosmeticKeys: LoadoutSlotKey[];
  /** Everything else the class could be carrying, in backpack order. */
  backpack: CatalogItem[];
}

export const EMPTY_SAMPLE: SampleInventory = { slots: {}, cosmeticKeys: [], backpack: [] };

/** The three cosmetics the sample wears. */
export const SAMPLE_COSMETICS = 3;
/** One backpack page. */
export const BACKPACK_SLOTS = 50;

/** Best first: plain "Unique" items that have a model, then ones that have an icon, then the rest by id. */
function ranked(items: readonly CatalogItem[], hasModel: (id: number) => boolean): CatalogItem[] {
  const score = (it: CatalogItem) =>
    (it.q === 'unique' ? 4 : 0) + (hasModel(it.id) ? 2 : 0) + (it.i ? 1 : 0);
  return [...items].sort((a, b) => score(b) - score(a) || a.id - b.id);
}

export function sampleInventory(
  catalog: Catalog,
  cls: TfClass,
  hasModel: (itemId: number) => boolean = () => true,
): SampleInventory {
  const slots: LoadoutSlots = {};
  const used = new Set<number>();
  for (const key of ['primary', 'secondary', 'melee'] as const) {
    const pick = ranked(itemsForSlot(catalog, cls, key), hasModel)[0];
    if (pick) {
      slots[key] = { item: pick.id };
      used.add(pick.id);
    }
  }
  const cosmeticKeys = COSMETIC_KEYS.slice(0, SAMPLE_COSMETICS);
  const cosmetics = ranked(itemsForSlot(catalog, cls, cosmeticKeys[0]), hasModel)
    .filter((it) => hasModel(it.id))
    .slice(0, SAMPLE_COSMETICS);
  cosmetics.forEach((it, i) => {
    slots[cosmeticKeys[i]] = { item: it.id };
    used.add(it.id);
  });

  const pool = [
    ...itemsForSlot(catalog, cls, 'primary'),
    ...itemsForSlot(catalog, cls, 'secondary'),
    ...itemsForSlot(catalog, cls, 'melee'),
    ...itemsForSlot(catalog, cls, cosmeticKeys[0]),
  ].filter((it) => !used.has(it.id));
  const backpack = ranked(pool, hasModel).slice(0, BACKPACK_SLOTS);
  return { slots, cosmeticKeys, backpack };
}
