/**
 * The item schema the simulation reads: the loadout builder's catalog
 * (lib/tf2-loadout/catalog-build.ts), installed once per thread with
 * `setItemCatalog`. The hub's match workers get it from the hub (which reads the
 * stored catalog row), the browser listen server and the predicting client from
 * `/api/tf2-loadout/catalog` — one schema for the builder and the game.
 *
 * Without a catalog the stock items still resolve, from the game's own extracted
 * table (data/items.ts), so a match never depends on the catalog to start.
 *
 * Environment-agnostic.
 */

import {
  TF_CLASSES,
  classBit,
  type Catalog,
  type CatalogAttribute,
  type CatalogItem,
  type ItemSlot,
  type TfClass,
} from '../../../tf2-loadout/catalog-types';
import { STOCK_ITEMS, type StockItem } from '../../data/items';

interface Installed {
  catalog: Catalog;
  byId: Map<number, CatalogItem>;
}

let installed: Installed | null = null;
const stockCache = new Map<number, CatalogItem | null>();

/** Installs (or clears) the catalog every resolver in this thread reads. Idempotent per hash. */
export function setItemCatalog(catalog: Catalog | null): void {
  if (!catalog) {
    installed = null;
    return;
  }
  if (installed?.catalog === catalog) return;
  if (
    installed &&
    installed.catalog.source.hash === catalog.source.hash &&
    installed.catalog.items.length === catalog.items.length
  )
    return;
  installed = { catalog, byId: new Map(catalog.items.map((i) => [i.id, i])) };
}

export function itemCatalog(): Catalog | null {
  return installed?.catalog ?? null;
}

/** The schema hash of the installed catalog ('' without one). */
export function itemCatalogHash(): string {
  return installed?.catalog.source.hash ?? '';
}

const SLOT_SET = new Set<string>(['primary', 'secondary', 'melee', 'building', 'pda', 'pda2']);

/** A stock item from the extracted table, in the catalog's shape (no catalog needed). */
function stockAsCatalogItem(s: StockItem): CatalogItem {
  let mask = 0;
  let overrides: Partial<Record<TfClass, ItemSlot>> | undefined;
  for (const cls of TF_CLASSES) {
    const slot = s.usedByClasses[cls];
    if (!slot) continue;
    mask |= classBit(cls);
    if (slot !== s.itemSlot && SLOT_SET.has(slot)) (overrides ??= {})[cls] = slot as ItemSlot;
  }
  const at: CatalogAttribute[] = [];
  for (const a of s.attributes) {
    if (!a.class || /^(min_viewmodel|weapon_stattrak|kill_eater|inspect_)/.test(a.class)) continue;
    // The extracted table does not carry the description format; stock items' gameplay
    // attributes (the flamethrower's flame model) are additive base values.
    at.push([a.class, a.value, 1]);
  }
  return {
    id: s.defindex,
    n: s.displayName,
    t: '',
    q: 'normal',
    s: s.itemSlot as ItemSlot,
    c: mask,
    ...(overrides ? { o: overrides } : {}),
    ic: s.itemClass,
    ...(s.animSlot ? { an: s.animSlot.toUpperCase() } : {}),
    ...(at.length ? { at } : {}),
  };
}

/** The schema entry for a defindex: the catalog's, else the stock table's, else null. */
export function catalogItem(defindex: number): CatalogItem | null {
  const hit = installed?.byId.get(defindex);
  if (hit) return hit;
  let s = stockCache.get(defindex);
  if (s === undefined) {
    const stock = STOCK_ITEMS[defindex];
    s = stock ? stockAsCatalogItem(stock) : null;
    stockCache.set(defindex, s);
  }
  return s;
}
