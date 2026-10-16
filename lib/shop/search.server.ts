/**
 * Catalog search for the economy pickers (savings goals, scheduled gifts).
 *
 * Done server-side so the ~1,000-item catalog never ships in a client chunk
 * just to power a type-ahead; the response is at most a dozen small rows.
 */
import { SHOP_ITEMS, type Rarity, type ShopItemKind } from '@/lib/shop/catalog';
import { isTradable } from '@/lib/market/tradable';

export type PickerMode = 'any' | 'tradable' | 'giftable';

export interface PickerItem {
  id: string;
  name: string;
  kind: ShopItemKind;
  rarity: Rarity;
  price: number;
}

const LIMIT = 12;

export function searchShopItems(query: string, mode: PickerMode): PickerItem[] {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];
  const out: PickerItem[] = [];
  for (const item of SHOP_ITEMS) {
    if (mode === 'tradable' && !isTradable(item.id)) continue;
    if (mode === 'giftable' && (item.requiresTier || item.price <= 0)) continue;
    if (!item.name.toLowerCase().includes(q) && !item.id.toLowerCase().includes(q)) continue;
    out.push({
      id: item.id,
      name: item.name,
      kind: item.kind,
      rarity: item.rarity,
      price: item.price,
    });
    if (out.length >= LIMIT) break;
  }
  return out;
}
