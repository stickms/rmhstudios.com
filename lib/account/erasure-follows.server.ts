import { prisma } from '@/lib/prisma.server';
import { HANDLE_RECLAIM_BLOCK_MS } from '@/lib/handles/history';
import { feedImageFilename, feedImageKey, ownsFeedImageUrl } from '@/lib/storage/keys';
import { variantKeysFor } from '@/lib/media/ingest.server';
import { purgeFromCdn } from '@/lib/storage/cdn.server';
import { deleteObject } from '@/lib/storage/s3.server';
import { referencedUrls } from '@/lib/media/sweep.server';
import { mediaSweepDeps } from '@/lib/media/sweep-jobs.server';

/**
 * Sprint 10 19: subscriptions, activity, RSVPs, handle history, listings and the small per-member records go with the
 * account. Account deletion anonymises the `User` row in place, so none of the `onDelete: Cascade` relations fire;
 * each table is deleted here by the member's id (every one has a member-column index; `HandleChange` and `Activity`
 * lead their composite indexes with `userId`, `Watch` and the rest through their unique or primary key).
 *
 * Verified per table, in both directions where the relation is two-sided:
 * - `Activity`: only the member's own rows exist (`kind` is `post` or `game`, never a member), `meta` goes with the row.
 * - `CustomFeedSubscription`, `PostSeriesFollow`: the member as subscriber only (the primary key is
 *   `(feedId|seriesId, userId)`, so one row is exactly one count). Subscriptions to the member's own feeds and series
 *   are other members' rows on content that stays (public) or goes by cascade (private feeds, `listsErasureOps`).
 *   `CustomFeed.subscriberCount` and `PostSeries.followCount` are decremented inside the transaction by one raw
 *   UPDATE each, derived from the subscription rows that exist at that moment (no read before it, so no race with an
 *   unsubscribe), before those rows are deleted, and floored with `> 0`.
 * - `Watch`: kinds on things (community, build, market), never on people; no counter.
 * - `Rsvp`: the member as attendee only; `releaseSeatsOf` has already freed seats and promoted the waitlist.
 * - `HandleChange`: rows past the reclaim window go now; the rest stay until the daily job
 *   (`handle-change-jobs.server.ts`), so the released handle keeps its 30 days of protection.
 * - `HomeListing`: authored listings (`favorites` cascade from the listing); `HomeRoommateProfile`. Listing photos are
 *   feed-space objects named `<userId>-…` (the homes uploader posts to `/api/rmharks/image`, which records no `Media`
 *   row, and the AI photo is stored directly); the member's own are deleted after the transaction by their URLs
 *   (`deleteMemberListingImageObjects`). Scraped listings have no author and are not touched.
 * - `RideshareDriver`: the member's application (no licence image is stored any more; nothing in storage). `Ride.driverId` references `User`, so rides are untouched. Where
 *   the member reviewed other applications (`reviewedById`, a plain relation with no cascade) it is nulled.
 * - `LibraryCollection`: own collections go (items cascade); an official one is the site's and is de-identified.
 *   `LibraryQuotaRequest`: the member's requests go; `decidedByUserId` on others' is nulled.
 * - `UserQuest`: progress only; paid rewards stay in the coin ledger.
 * - `RmhTubeSubscription` is `owner` (a channel is a member, the open follows decision) and has no operation here.
 *
 * Idempotent: a re-run finds no subscription rows, so it deletes and decrements nothing.
 */

/**
 * Read before the transaction: the member's listing photo URLs (`HomeListing.images`; `aiImages` is a subset). Guarded
 * for test proxies, which answer a read with an operation object instead of rows.
 */
export async function readListingImageUrls(userId: string): Promise<string[]> {
  const rows = await prisma.homeListing.findMany({ where: { authorId: userId }, select: { images: true } });
  if (!Array.isArray(rows)) return [];
  return [...new Set(rows.flatMap((r) => (Array.isArray(r.images) ? r.images : [])))];
}

export interface ListingImageDeps {
  /** The URLs something still names (the media sweep's reference check). */
  referenced(urls: string[]): Promise<Set<string>>;
}

const defaultListingImageDeps: ListingImageDeps = {
  referenced: (urls) => referencedUrls(mediaSweepDeps(), urls),
};

/**
 * After the transaction: delete the stored photo objects (and variants) of the erased listings, by the URLs read
 * before it. Only the member's own feed-space objects (`<userId>-…` file names) are touched; a third-party URL or
 * someone else's upload is skipped, and so is any URL the media sweep's reference check still finds (a post, a chat
 * message, another member's listing that re-used it). Uploads through `/api/rmharks/image` and the AI photo record no
 * `Media` row; a row a developer-API upload left for the same URL goes once its object is gone. Fails safe: if the
 * reference check cannot run, nothing is deleted; a failed delete leaves that object. Runs twice harmlessly.
 */
export async function deleteMemberListingImageObjects(
  userId: string,
  urls: string[],
  deps: ListingImageDeps = defaultListingImageDeps,
): Promise<void> {
  const own = [...new Set(urls)].filter((u) => typeof u === 'string' && ownsFeedImageUrl(u, userId));
  if (own.length === 0) return;
  let kept: Set<string>;
  try {
    kept = await deps.referenced(own);
  } catch {
    return;
  }
  const gone: string[] = [];
  for (const url of own) {
    if (kept.has(url)) continue;
    const name = feedImageFilename(url);
    if (!name || name.includes('..')) continue;
    const key = feedImageKey(name);
    try {
      const keys = [...variantKeysFor(key), key];
      for (const k of keys) await deleteObject(k);
      for (const k of keys) await purgeFromCdn(k).catch(() => {});
      gone.push(url);
    } catch {
      // kept: the object stays until a later sweep of the feed space
    }
  }
  if (gone.length > 0) {
    await Promise.resolve(prisma.media.deleteMany({ where: { userId, url: { in: gone } } })).catch(() => {});
  }
}

/**
 * The two counter corrections as parameterized raw UPDATEs. A test proxy answers `$executeRaw` with a non-callable
 * object, so they are skipped there; the real client always has the function.
 */
export function counterOps(userId: string) {
  if (typeof prisma.$executeRaw !== 'function') return [];
  return [
    prisma.$executeRaw`UPDATE "custom_feed" SET "subscriberCount" = "subscriberCount" - 1 WHERE "id" IN (SELECT "feedId" FROM "custom_feed_subscription" WHERE "userId" = ${userId}) AND "subscriberCount" > 0`,
    prisma.$executeRaw`UPDATE "post_series" SET "followCount" = "followCount" - 1 WHERE "id" IN (SELECT "seriesId" FROM "post_series_follow" WHERE "userId" = ${userId}) AND "followCount" > 0`,
  ];
}

export function followsErasureOps(userId: string, now: Date = new Date()) {
  const reclaimCutoff = new Date(now.getTime() - HANDLE_RECLAIM_BLOCK_MS);
  return [
    // Counters on the kept feeds and series: one per subscription row that exists when the transaction runs, so a
    // member who unsubscribed after the deletion began is not counted twice, and a retry (no rows left) changes
    // nothing. Floored at zero. These run before the subscription rows go.
    ...counterOps(userId),
    prisma.customFeedSubscription.deleteMany({ where: { userId } }),
    prisma.postSeriesFollow.deleteMany({ where: { userId } }),
    prisma.watch.deleteMany({ where: { userId } }),
    // Activity and attendance.
    prisma.activity.deleteMany({ where: { userId } }),
    prisma.rsvp.deleteMany({ where: { userId } }),
    // Handles released more than the reclaim window ago; newer rows stay for the daily job.
    prisma.handleChange.deleteMany({ where: { userId, createdAt: { lt: reclaimCutoff } } }),
    // Housing: listings (favourites and inquiries cascade), roommate profile.
    prisma.homeListing.deleteMany({ where: { authorId: userId } }),
    prisma.homeRoommateProfile.deleteMany({ where: { userId } }),
    // Driver application; rides reference the user, not this row. Applications the member reviewed are unlinked.
    prisma.rideshareDriver.deleteMany({ where: { userId } }),
    prisma.rideshareDriver.updateMany({ where: { reviewedById: userId }, data: { reviewedById: null } }),
    // Library: an official collection is the site's; the member's own collections go with their items.
    prisma.libraryCollection.updateMany({
      where: { ownerUserId: userId, official: true },
      data: { ownerUserId: null },
    }),
    prisma.libraryCollection.deleteMany({ where: { ownerUserId: userId, official: false } }),
    prisma.libraryQuotaRequest.deleteMany({ where: { userId } }),
    prisma.libraryQuotaRequest.updateMany({ where: { decidedByUserId: userId }, data: { decidedByUserId: null } }),
    // Quest progress only; rewards already paid stay in the coin ledger.
    prisma.userQuest.deleteMany({ where: { userId } }),
  ];
}
