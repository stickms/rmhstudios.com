/**
 * Daily shop + bundle purchase — server side (C2, C3).
 *
 * The featured set is derived, never stored (see `daily-shop.ts`). A single
 * item is bought through the ordinary `/api/shop/purchase` path at its normal
 * price; only the bundle needs its own route, because it is the one purchase
 * that must grant several items atomically at a price the catalog does not list.
 */
import { createHash } from 'node:crypto';
import { prisma } from '@/lib/prisma.server';
import { debitCoins, InsufficientFundsError } from '@/lib/economy/ledger.server';
import { getShopItem } from '@/lib/shop/catalog';
import {
  BUNDLE_DISCOUNT_PCT,
  BUNDLE_SIZE,
  bundlePrice,
  checkBundle,
  dailyFeaturedIds,
  type DailyShopItem,
  type DailyShopView,
  nextRotationAt,
  utcDateKey,
} from '@/lib/shop/daily-shop';

// The featured set only changes once a day; recomputing it sorts ~1000 items.
let memo: { dateKey: string; ids: string[] } | null = null;
function featuredFor(dateKey: string): string[] {
  if (memo?.dateKey === dateKey) return memo.ids;
  const ids = dailyFeaturedIds(dateKey);
  memo = { dateKey, ids };
  return ids;
}

/** Today's featured ids — shared with the wishlist alert job. */
export function featuredIdsForDate(dateKey: string): string[] {
  return featuredFor(dateKey);
}

export async function getDailyShop(
  userId: string | null,
  now: Date = new Date(),
): Promise<DailyShopView> {
  const dateKey = utcDateKey(now);
  const ids = featuredFor(dateKey);

  let owned = new Set<string>();
  let coins = 0;
  if (userId) {
    const [inv, profile] = await Promise.all([
      prisma.userInventory.findMany({
        where: { userId, itemId: { in: ids } },
        select: { itemId: true },
      }),
      prisma.userProfile.findUnique({ where: { userId }, select: { coins: true } }),
    ]);
    owned = new Set(inv.map((i) => i.itemId));
    coins = Number(profile?.coins ?? 0);
  }

  const items: DailyShopItem[] = [];
  for (const id of ids) {
    const item = getShopItem(id);
    if (!item) continue;
    items.push({
      id: item.id,
      kind: item.kind,
      name: item.name,
      description: item.description,
      price: item.price,
      rarity: item.rarity,
      data: item.data,
      owned: owned.has(id),
    });
  }

  return {
    dateKey,
    rotatesAt: nextRotationAt(now).toISOString(),
    items,
    coins,
    signedIn: !!userId,
    bundle: { size: BUNDLE_SIZE, discountPct: BUNDLE_DISCOUNT_PCT },
  };
}

export type BundleErrorCode =
  'INVALID_BUNDLE' | 'ALREADY_OWNED' | 'INSUFFICIENT_COINS' | 'ALREADY_PURCHASED';

export class BundleError extends Error {
  constructor(readonly code: BundleErrorCode) {
    super(code);
    this.name = 'BundleError';
  }
}

/** Ledger dedupe token for one member buying one particular bundle on one day. */
export function bundleIdempotencyKey(userId: string, dateKey: string, itemIds: string[]): string {
  const digest = createHash('sha256')
    .update([...itemIds].sort().join('|'))
    .digest('hex')
    .slice(0, 24);
  return `shop-bundle:${userId}:${dateKey}:${digest}`;
}

/**
 * Buy three of today's featured items at the bundle price. All-or-nothing: the
 * debit and every inventory row commit in one transaction, so a failure at any
 * step (balance, an item already owned, a unique-key race with a concurrent
 * single purchase) leaves the member with neither the items nor a charge.
 */
export async function purchaseBundle(
  userId: string,
  itemIds: string[],
  now: Date = new Date(),
): Promise<{ newBalance: number; price: number; listPrice: number }> {
  const dateKey = utcDateKey(now);
  const check = checkBundle(itemIds, featuredFor(dateKey), getShopItem);
  if (!check.ok) throw new BundleError('INVALID_BUNDLE');

  try {
    await prisma.$transaction(async (tx) => {
      const have = await tx.userInventory.count({ where: { userId, itemId: { in: itemIds } } });
      if (have > 0) throw new BundleError('ALREADY_OWNED');

      const names = itemIds.map((id) => getShopItem(id)?.name ?? id).join(', ');
      const paid = await debitCoins(userId, check.price, {
        tx,
        type: 'PURCHASE',
        entityType: 'shop',
        entityId: 'bundle',
        note: `Bundle: ${names}`,
        idempotencyKey: bundleIdempotencyKey(userId, dateKey, itemIds),
      });
      // A replay means this exact bundle was already paid for today and the
      // items were since removed (sold on the market). Charging nothing and
      // granting again would be free items; refuse instead.
      if (paid.replayed) throw new BundleError('ALREADY_PURCHASED');

      await tx.userInventory.createMany({
        data: itemIds.map((id) => ({ userId, itemId: id, kind: getShopItem(id)!.kind })),
      });
    });
  } catch (err) {
    if (err instanceof InsufficientFundsError) throw new BundleError('INSUFFICIENT_COINS');
    // Lost a race with a concurrent purchase of one of the same items.
    if ((err as { code?: string })?.code === 'P2002') throw new BundleError('ALREADY_OWNED');
    throw err;
  }

  const profile = await prisma.userProfile.findUnique({
    where: { userId },
    select: { coins: true },
  });
  return { newBalance: Number(profile?.coins ?? 0), price: check.price, listPrice: check.listPrice };
}

export { bundlePrice };
