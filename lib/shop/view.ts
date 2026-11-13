/**
 * The shop grid's filter and order, as a pure function (client-safe: no server imports).
 *
 * One category at a time, optionally narrowed to what the viewer owns or does not own, ordered by
 * rarity (low to high, then price) or by price.
 */
import { RARITY_ORDER, type Rarity, type ShopItemKind } from '@/lib/shop/catalog';

export const SHOP_SHOW = ['all', 'owned', 'unowned'] as const;
export type ShopShow = (typeof SHOP_SHOW)[number];

export const SHOP_SORT = ['rarity', 'price_asc', 'price_desc'] as const;
export type ShopSort = (typeof SHOP_SORT)[number];

interface Viewable {
  kind: ShopItemKind;
  rarity: Rarity;
  price: number;
  owned: boolean;
}

export function shopView<T extends Viewable>(
  items: readonly T[],
  { kind, show, sort }: { kind: ShopItemKind; show: ShopShow; sort: ShopSort },
): T[] {
  const rank = (r: Rarity) => RARITY_ORDER.indexOf(r);
  return items
    .filter((i) => i.kind === kind)
    .filter((i) => (show === 'owned' ? i.owned : show === 'unowned' ? !i.owned : true))
    .slice()
    .sort((a, b) =>
      sort === 'price_asc'
        ? a.price - b.price || rank(a.rarity) - rank(b.rarity)
        : sort === 'price_desc'
          ? b.price - a.price || rank(b.rarity) - rank(a.rarity)
          : rank(a.rarity) - rank(b.rarity) || a.price - b.price,
    );
}
