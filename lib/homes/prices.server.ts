/**
 * RMHHomes — price changes (server only).
 *
 * Both writers of a listing's price record here: an author's edit (inside `updateListing`'s transaction) and a
 * scraper run (`process-source.ts`, which keeps its own structural client and uses the pure rules in
 * `./prices`). This module also owns the history read, the per-favourite alert switch, the "Reduced $X" read
 * for a page of listings and the web-tier drop fan-out.
 */

import type { Prisma } from '@prisma/client';
import { createNotification } from '@/lib/notifications.server';
import { prisma } from '@/lib/prisma.server';
import {
  HISTORY_LIMIT,
  isPriceChange,
  isPriceDrop,
  percentChange,
  reducedByCents,
  reducedSince,
  type PriceChange,
  type PriceChangeSource,
} from './prices';
import { dropLink, notifyPriceDrop, type DropPrisma, type PriceDrop } from './price-drop-notify.server';

/**
 * Record a change inside the caller's transaction: insert the row only when the price really changed and, for a
 * drop of at least 1%, stamp `priceDroppedAt`. Returns whether the change was a drop.
 */
export async function recordPriceChange(
  tx: Prisma.TransactionClient,
  input: { listingId: string; oldCents: number; newCents: number; source: PriceChangeSource; now?: Date },
): Promise<{ changed: boolean; dropped: boolean }> {
  if (!isPriceChange(input.oldCents, input.newCents)) return { changed: false, dropped: false };
  const now = input.now ?? new Date();
  await tx.homeListingPriceChange.create({
    data: {
      listingId: input.listingId,
      oldCents: input.oldCents,
      newCents: input.newCents,
      source: input.source,
      changedAt: now,
    },
  });
  const dropped = isPriceDrop(input.oldCents, input.newCents);
  if (dropped) {
    await tx.homeListing.update({ where: { id: input.listingId }, data: { priceDroppedAt: now } });
  }
  return { changed: true, dropped };
}

/** Tell the favouriters of a listing about a drop (after the write committed). Best-effort. */
export async function notifyFavouritersOfDrop(drop: PriceDrop, now: Date = new Date()): Promise<number> {
  return notifyPriceDrop(
    {
      prisma: prisma as unknown as DropPrisma,
      deliver: (userId, d, preview) =>
        createNotification({
          userId,
          ...(d.authorId ? { actorId: d.authorId } : {}),
          type: 'SYSTEM',
          entityType: 'home_price_drop',
          entityId: d.listingId,
          preview,
          link: dropLink(d.listingId),
        }),
    },
    drop,
    now,
  );
}

/**
 * The price history of a listing the public listing read would show (active; its author may also read an
 * inactive one), newest first, up to 20. Null means "answer 404".
 */
export async function listPriceHistory(listingId: string, viewerId: string | null): Promise<PriceChange[] | null> {
  const listing = await prisma.homeListing.findUnique({
    where: { id: listingId },
    select: { status: true, authorId: true },
  });
  if (!listing) return null;
  if (listing.status !== 'ACTIVE' && !(viewerId && viewerId === listing.authorId)) return null;
  const rows = await prisma.homeListingPriceChange.findMany({
    where: { listingId },
    orderBy: { changedAt: 'desc' },
    take: HISTORY_LIMIT,
  });
  return rows.map((r) => ({
    id: r.id,
    oldPrice: Math.round(r.oldCents) / 100,
    newPrice: Math.round(r.newCents) / 100,
    percent: percentChange(r.oldCents, r.newCents),
    source: r.source === 'feed' ? 'feed' : 'author',
    changedAt: r.changedAt.toISOString(),
  }));
}

/**
 * For a page of listings: how much cheaper each one is (in cents) when its last change in the last 30 days was
 * a drop. One indexed read for the whole page, only for listings whose `priceDroppedAt` is in the window.
 */
export async function reductionsFor(
  rows: ReadonlyArray<{ id: string; priceDroppedAt: Date | null }>,
  now: Date = new Date(),
): Promise<Map<string, number>> {
  const since = reducedSince(now);
  const ids = rows.filter((r) => r.priceDroppedAt && r.priceDroppedAt >= since).map((r) => r.id);
  const out = new Map<string, number>();
  if (ids.length === 0) return out;
  const changes = await prisma.homeListingPriceChange.findMany({
    where: { listingId: { in: ids }, changedAt: { gte: since } },
    orderBy: { changedAt: 'desc' },
    select: { listingId: true, oldCents: true, newCents: true },
  });
  const seen = new Set<string>();
  for (const c of changes) {
    if (seen.has(c.listingId)) continue;
    seen.add(c.listingId);
    const by = reducedByCents(c.oldCents, c.newCents);
    if (by != null) out.set(c.listingId, by);
  }
  return out;
}

/** Turn the alert on or off on the caller's own favourite. False when they have not saved the listing. */
export async function setPriceAlerts(userId: string, listingId: string, enabled: boolean): Promise<boolean> {
  const res = await prisma.homeFavorite.updateMany({
    where: { userId, listingId },
    data: { priceAlerts: enabled },
  });
  return res.count > 0;
}
