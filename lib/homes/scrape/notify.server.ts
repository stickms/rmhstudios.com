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
        preview:
          `New ${kind} matching “${w.label}”: ${listing.title} — $${priceDollars} in ${listing.city}, ${listing.state}`.slice(
            0,
            280,
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
