/**
 * RMHHomes scraper — lightweight watch-alert notifier (server only).
 *
 * When the scraper discovers a new external listing, the homes worker uses this
 * to drop an in-app notification to anyone whose watch matches. It writes
 * Notification rows directly through the injected prisma client and deliberately
 * does NOT import the full notifications/push/cosmetics stack — keeping the
 * worker bundle small and free of the app's UI-side dependencies. (Web-push
 * mirroring stays on the interactive API path via lib/notifications.server.)
 */

import { notice, noticeColumns } from '@/lib/notifications/notice-keys';
import { dropLink, notifyPriceDrop, type DropPrisma, type PriceDrop } from '../price-drop-notify.server';
import { listingMatchesWatch, type MatchableListing, type WatchCriteria } from '../watch-match';

type WatchRow = WatchCriteria & { id: string; userId: string; label: string };

interface ListingRow extends MatchableListing {
  id: string;
  status: string;
  authorId: string | null;
  title: string;
  city: string;
  state: string;
}

export interface NotifyPrisma {
  homeListing: {
    findUnique(args: { where: { id: string } }): Promise<ListingRow | null>;
  };
  homeWatch: {
    findMany(args: { where: Record<string, unknown>; take?: number }): Promise<WatchRow[]>;
    updateMany(args: {
      where: Record<string, unknown>;
      data: Record<string, unknown>;
    }): Promise<{ count: number }>;
  };
  notification: {
    createMany(args: { data: Record<string, unknown>[] }): Promise<{ count: number }>;
  };
  homeFavorite: DropPrisma['homeFavorite'];
  userBlock: DropPrisma['userBlock'];
}

/**
 * Notify watchers of a newly discovered external listing. Best-effort: swallows
 * all errors so it can never disrupt a scrape run.
 */
export async function notifyWatchersOfExternalListing(
  prisma: NotifyPrisma,
  listingId: string,
  now: Date = new Date(),
): Promise<number> {
  try {
    const listing = await prisma.homeListing.findUnique({ where: { id: listingId } });
    if (!listing || listing.status !== 'ACTIVE') return 0;

    const watches = await prisma.homeWatch.findMany({ where: { active: true }, take: 2000 });
    const toNotify = watches.filter((w) => listingMatchesWatch(w, listing));
    if (toNotify.length === 0) return 0;

    const priceDollars = Math.round(listing.priceCents / 100).toLocaleString('en-US');
    const kind = listing.listingType === 'RENT' ? 'rental' : 'home for sale';

    // One bulk insert instead of an awaited create per watcher. The watch query
    // above takes up to 2000 rows, so a broadly-matching listing meant up to
    // 2000 sequential round-trips here; the rows are independent and none of
    // them is read back, which is exactly what createMany is for.
    await prisma.notification.createMany({
      data: toNotify.map((w) => ({
        userId: w.userId,
        actorId: null,
        type: 'SYSTEM' as const,
        entityType: 'home_listing',
        entityId: listing.id,
        ...noticeColumns(
          notice(kind === 'rental' ? 'home-watch-rental' : 'home-watch-sale', {
            label: w.label,
            title: listing.title,
            price: priceDollars,
            city: listing.city,
            state: listing.state,
          }),
        ),
        link: `/homes/listing/${listing.id}`,
      })),
    });

    await prisma.homeWatch.updateMany({
      where: { id: { in: toNotify.map((w) => w.id) } },
      data: { lastNotifiedAt: now },
    });

    return toNotify.length;
  } catch (err) {
    console.error('[homes-worker] notifyWatchersOfExternalListing failed:', err);
    return 0;
  }
}

/**
 * Tell the favouriters of a scraped listing that its price dropped. The rules (switch, one notice a week,
 * bans, the cap) are `notifyPriceDrop`'s; delivery here is a direct Notification insert, like the watch alerts
 * above, so the worker bundle stays small. Best-effort: never throws.
 */
export async function notifyFavouritersOfExternalDrop(
  prisma: NotifyPrisma,
  drop: Omit<PriceDrop, 'authorId'>,
  now: Date = new Date(),
): Promise<number> {
  return notifyPriceDrop(
    {
      prisma,
      deliver: async (userId, d, preview) => {
        await prisma.notification.createMany({
          data: [
            {
              userId,
              actorId: null,
              type: 'SYSTEM' as const,
              entityType: 'home_price_drop',
              entityId: d.listingId,
              ...noticeColumns(preview),
              link: dropLink(d.listingId),
            },
          ],
        });
      },
    },
    { ...drop, authorId: null },
    now,
  );
}
