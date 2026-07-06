import { prisma } from '@/lib/prisma.server';
import { SHOP_ITEMS } from '@/lib/shop/catalog';

export type ShopListItem = (typeof SHOP_ITEMS)[number] & { owned: boolean; equipped: boolean };

export interface ShopData {
  coins: number;
  items: ShopListItem[];
  signedIn: boolean;
}

/**
 * The shop catalog plus, for a signed-in user, their coin balance and which
 * items they own/have equipped. Shared by the `/api/shop` GET handler and the
 * `/shop` + `/store` route loaders so the shop is server-rendered / prefetched
 * instead of fetched on mount.
 */
export async function getShopData(userId: string | null): Promise<ShopData> {
  let coins = 0;
  let owned = new Map<string, boolean>();
  if (userId) {
    const [profile, inv] = await Promise.all([
      prisma.userProfile.findUnique({ where: { userId }, select: { coins: true } }),
      prisma.userInventory.findMany({ where: { userId }, select: { itemId: true, equipped: true } }),
    ]);
    coins = profile?.coins ?? 0;
    owned = new Map(inv.map((i) => [i.itemId, i.equipped]));
  }

  const items: ShopListItem[] = SHOP_ITEMS.map((i) => ({
    ...i,
    owned: owned.has(i.id),
    equipped: owned.get(i.id) ?? false,
  }));

  return { coins, items, signedIn: !!userId };
}
