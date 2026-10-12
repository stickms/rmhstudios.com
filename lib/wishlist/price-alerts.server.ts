/**
 * Wishlist price-drop alerts — the daily sweep (C8).
 *
 * Walks `shop_item` and `market_cosmetic` wishlist entries in id order, one
 * bounded page at a time, and notifies through `createNotification`. Per page:
 * one price lookup (the catalog for shop items; one grouped `MIN(priceCoins)`
 * query for market items) and one inventory query — no per-entry reads.
 *
 * Dedupe is claimed BEFORE notifying, with a conditional update on the entry's
 * `lastAlertKey`, so a re-run (pg-boss is at-least-once) or two overlapping runs
 * cannot send the same alert twice. The cost of claiming first is that a crash
 * between claim and send loses one alert, which is the right way round for a
 * notification: a missed nudge is cheap, a spammed member is not.
 */
import { prisma } from '@/lib/prisma.server';
import { createNotification } from '@/lib/notifications.server';
import { getShopItem } from '@/lib/shop/catalog';
import { featuredIdsForDate } from '@/lib/shop/daily-shop.server';
import { utcDateKey } from '@/lib/shop/daily-shop';
import { alertPreview, decideAlert } from '@/lib/wishlist/price-alerts';

const PAGE = 500;
/** Per-run ceiling: 40 pages = 20,000 entries. The rest is picked up tomorrow. */
const MAX_PAGES = 40;
const CHUNK = 25;

export interface AlertSweepResult {
  scanned: number;
  alerted: number;
  priceUpdates: number;
}

export async function runWishlistAlerts(now: Date = new Date()): Promise<AlertSweepResult> {
  const dateKey = utcDateKey(now);
  const featured = new Set(featuredIdsForDate(dateKey));
  const res: AlertSweepResult = { scanned: 0, alerted: 0, priceUpdates: 0 };

  let cursor: string | undefined;
  for (let page = 0; page < MAX_PAGES; page++) {
    const entries = await prisma.wishlistEntry.findMany({
      where: { entityType: { in: ['shop_item', 'market_cosmetic'] } },
      orderBy: { id: 'asc' },
      take: PAGE,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: {
        id: true,
        userId: true,
        entityType: true,
        entityId: true,
        targetPrice: true,
        lastSeenPrice: true,
        lastAlertKey: true,
      },
    });
    if (entries.length === 0) break;
    cursor = entries[entries.length - 1]!.id;
    res.scanned += entries.length;

    // Market prices: one grouped query for every distinct item on the page.
    const marketIds = [
      ...new Set(entries.filter((e) => e.entityType === 'market_cosmetic').map((e) => e.entityId)),
    ];
    const marketMin = new Map<string, number>();
    if (marketIds.length > 0) {
      const mins = await prisma.marketListing.groupBy({
        by: ['itemId'],
        where: { itemId: { in: marketIds }, status: 'ACTIVE' },
        _min: { priceCoins: true },
      });
      for (const m of mins) {
        if (m._min.priceCoins != null) marketMin.set(m.itemId, m._min.priceCoins);
      }
    }

    // Ownership: one query over the page's (user, item) cross product.
    const inv = await prisma.userInventory.findMany({
      where: {
        userId: { in: [...new Set(entries.map((e) => e.userId))] },
        itemId: { in: [...new Set(entries.map((e) => e.entityId))] },
      },
      select: { userId: true, itemId: true },
    });
    const owned = new Set(inv.map((i) => `${i.userId}:${i.itemId}`));

    const work: (() => Promise<void>)[] = [];
    for (const e of entries) {
      const isShop = e.entityType === 'shop_item';
      const currentPrice = isShop
        ? (getShopItem(e.entityId)?.price ?? null)
        : (marketMin.get(e.entityId) ?? null);

      const decision = decideAlert({
        currentPrice,
        lastSeenPrice: e.lastSeenPrice,
        targetPrice: e.targetPrice,
        inDailyShop: isShop && featured.has(e.entityId),
        dateKey,
        owned: owned.has(`${e.userId}:${e.entityId}`),
        lastAlertKey: e.lastAlertKey,
      });

      const priceChanged = currentPrice !== null && currentPrice !== e.lastSeenPrice;
      if (!decision && !priceChanged) continue;

      work.push(async () => {
        if (!decision) {
          await prisma.wishlistEntry.update({
            where: { id: e.id },
            data: { lastSeenPrice: currentPrice },
          });
          res.priceUpdates += 1;
          return;
        }
        const claim = await prisma.wishlistEntry.updateMany({
          where: {
            id: e.id,
            OR: [{ lastAlertKey: null }, { lastAlertKey: { not: decision.key } }],
          },
          data: {
            lastAlertKey: decision.key,
            lastAlertAt: now,
            ...(currentPrice !== null ? { lastSeenPrice: currentPrice } : {}),
          },
        });
        if (claim.count === 0) return;
        res.alerted += 1;
        const name = getShopItem(e.entityId)?.name ?? e.entityId;
        await createNotification({
          userId: e.userId,
          type: 'SYSTEM',
          entityType: e.entityType,
          entityId: e.entityId,
          preview: alertPreview(decision.reason, name, currentPrice),
          link:
            decision.reason === 'daily-shop'
              ? '/store?tab=daily'
              : isShop
                ? '/store?tab=shop'
                : '/store?tab=market',
        });
      });
    }

    for (let i = 0; i < work.length; i += CHUNK) {
      await Promise.all(work.slice(i, i + CHUNK).map((fn) => fn()));
    }

    if (entries.length < PAGE) break;
  }
  return res;
}
