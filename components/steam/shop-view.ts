import { RARITY_ORDER, type ShopItem, type ShopItemKind } from '@/lib/shop/catalog';

/** A catalog item plus what the viewer owns: the shape `getShopData` returns. */
export type SteamShopItem = ShopItem & { owned: boolean; equipped: boolean };

/** One category of the catalog, rarity low to high, then price low to high. */
export function visibleShopItems(items: SteamShopItem[], kind: ShopItemKind): SteamShopItem[] {
  return items
    .filter((i) => i.kind === kind)
    .sort(
      (a, b) =>
        RARITY_ORDER.indexOf(a.rarity) - RARITY_ORDER.indexOf(b.rarity) || a.price - b.price,
    );
}

/**
 * What the button on an item should do. Plan-gated items (`requiresTier`) stay
 * `'ok'`: the viewer's tier is not in the page data, so the server rejects the
 * purchase and the page shows its message.
 */
export function canBuy(
  item: SteamShopItem,
  coins: number,
  signedIn: boolean,
): 'ok' | 'signed-out' | 'owned' | 'poor' {
  if (!signedIn) return 'signed-out';
  if (item.owned) return 'owned';
  if (coins < item.price) return 'poor';
  return 'ok';
}
