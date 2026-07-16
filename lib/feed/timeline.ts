/**
 * Unified feed timeline assembly (Phase 0 of docs/feed/plan.md).
 *
 * One function — `getTimeline()` — is the single read path for both feed
 * surfaces. Previously the "all"/global and "friends" branches in
 * app/routes/api/rmharks.ts duplicated ~150 lines of mapping logic; folding
 * them here gives one place to add caching, ranking, and fan-out later.
 *
 * Twitter-shaped naming:
 *   - "following" = follow-graph home, strict reverse-chron.
 *   - "foryou"    = the global surface (chrono today; ranked via lib/feed/ranking).
 *
 * Counts come from the denormalized columns on RMHark (Phase 1), so the read
 * path no longer does `_count` aggregation per item.
 */

import { prisma } from "../prisma.server";
import type { FeedItem, FeedFilter, FeedPoll } from "../feed-types";
import { userDisplaySelect, resolveUser } from "../user-display";
import { getAllPosts } from "../blog";
import { decodeCursor, encodeCursor, keysetWhere } from "./cursor";
import { rankCandidates, type RankContext } from "./ranking";
import { buildInterestProfile } from "./personalize.server";
import { getHiddenAuthorIds } from "../moderation.server";
import { audienceWhere } from "./audience.server";
import { applyLock } from "./map-feed-item.server";
import { groupReactions } from "../social/reactions";
import { apiCache } from "../cache";

export type FeedSurface = "following" | "foryou";

export interface GetTimelineParams {
  /** Viewer id (for liked/reposted state and the follow graph); null = anon. */
  userId: string | null;
  /** Which surface to assemble. */
  surface: FeedSurface;
  /** Content-type tab (only meaningful on "foryou"). */
  filter: FeedFilter;
  /** Opaque keyset cursor token, or null for the first page. */
  cursor: string | null;
  /** Page size. */
  limit: number;
  /** Optional content search (RMHarks only). */
  search: string | null;
}

export interface TimelineResult {
  items: FeedItem[];
  nextCursor: string | null;
  hasMore: boolean;
  /** True when "following" has no candidates — lets the UI offer a cold-start. */
  empty?: boolean;
}

/* ------------------------------------------------------------------ */
/*  Poll helpers                                                       */
/* ------------------------------------------------------------------ */

function pollInclude(userId: string | null) {
  return {
    include: {
      options: {
        orderBy: { position: "asc" as const },
        include: {
          _count: { select: { votes: true } },
          ...(userId
            ? { votes: { where: { userId }, select: { id: true, optionId: true } } }
            : {}),
        },
      },
    },
  };
}

function mapPoll(poll: any): FeedPoll | undefined {
  if (!poll) return undefined;
  const totalVotes = poll.options.reduce(
    (sum: number, o: any) => sum + (o._count?.votes ?? 0),
    0
  );
  return {
    id: poll.id,
    question: poll.question,
    multiSelect: poll.multiSelect,
    closesAt: poll.closesAt ? poll.closesAt.toISOString() : null,
    totalVotes,
    options: poll.options.map((o: any) => ({
      id: o.id,
      text: o.text,
      voteCount: o._count?.votes ?? 0,
    })),
    myVotes: poll.options
      .filter((o: any) => o.votes?.length > 0)
      .map((o: any) => o.id),
  };
}

/* ------------------------------------------------------------------ */
/*  Repost de-duplication                                              */
/* ------------------------------------------------------------------ */

export function deduplicateReposts(items: FeedItem[], windowSize = 2): FeedItem[] {
  const result: FeedItem[] = [];
  for (const item of items) {
    if (item.repostedBy) {
      const underlyingId = item.actualId ?? item.id;
      const recentIds = result.slice(-windowSize).map((i) => i.actualId ?? i.id);
      if (recentIds.includes(underlyingId)) continue;
    }
    result.push(item);
  }
  return result;
}

/* ------------------------------------------------------------------ */
/*  Prisma → FeedItem mapping (counts from denormalized columns)        */
/* ------------------------------------------------------------------ */

function rmharkInclude(userId: string | null) {
  return {
    user: { select: userDisplaySelect },
    reactions: { select: { emoji: true, userId: true } },
    ...(userId
      ? {
          likes: { where: { userId }, select: { id: true } },
          reposts: { where: { userId }, select: { id: true } },
          bookmarks: { where: { userId }, select: { id: true } },
          unlocks: { where: { userId }, select: { id: true } },
        }
      : {}),
    poll: pollInclude(userId),
    original: {
      include: { user: { select: userDisplaySelect } },
    },
  } as const;
}

function deletedMessageFor(record: { deletedByAdmin?: boolean }): string {
  return record.deletedByAdmin
    ? "[This RMHark was deleted by an admin]"
    : "[This RMHark was deleted by the user]";
}

function mapOriginal(o: any): FeedItem | undefined {
  if (!o) return undefined;
  const isDeleted = !!o.deletedAt;
  // Only free, public originals expose their media in the quote card —
  // paid/followers-only content must not leak through a quote.
  const showMedia = !isDeleted && (o.unlockPrice ?? 0) === 0 && o.audience === "PUBLIC";
  return {
    id: o.id,
    type: "rmhark",
    createdAt: o.createdAt.toISOString(),
    content: isDeleted ? deletedMessageFor(o) : o.content,
    user: resolveUser(o.user),
    likeCount: o.likeCount,
    commentCount: o.commentCount,
    repostCount: o.repostCount,
    viewCount: o.viewCount,
    gifUrl: showMedia ? (o.gifUrl ?? undefined) : undefined,
    imageUrls: showMedia ? o.imageUrls : undefined,
    imageAlts: showMedia ? o.imageAlts : undefined,
    deletedAt: o.deletedAt?.toISOString() || null,
    deletedByAdmin: o.deletedByAdmin,
  };
}

function mapOwn(r: any, userId: string | null): FeedItem {
  const isDeleted = !!r.deletedAt;
  const item: FeedItem = {
    id: r.id,
    type: "rmhark",
    createdAt: r.createdAt.toISOString(),
    content: isDeleted ? deletedMessageFor(r) : r.content,
    user: resolveUser(r.user),
    likeCount: r.likeCount,
    commentCount: r.commentCount,
    repostCount: r.repostCount,
    viewCount: r.viewCount,
    liked: userId ? r.likes?.length > 0 : false,
    reposted: userId ? r.reposts?.length > 0 : false,
    bookmarked: userId ? r.bookmarks?.length > 0 : false,
    edited: !!r.editedAt,
    original: mapOriginal(r.original),
    poll: isDeleted ? undefined : mapPoll(r.poll),
    gifUrl: isDeleted ? undefined : (r.gifUrl ?? undefined),
    imageUrls: isDeleted ? undefined : r.imageUrls,
    imageAlts: isDeleted ? undefined : r.imageAlts,
    isSensitive: isDeleted ? false : (r.isSensitive ?? false),
    replyControl: r.replyControl ?? 'EVERYONE',
    reactions: groupReactions(r.reactions ?? [], userId),
    threadReplyCount: r.threadReplyCount ?? 0,
    deletedAt: r.deletedAt?.toISOString() || null,
    deletedByAdmin: r.deletedByAdmin,
  };
  return isDeleted ? item : applyLock(item, r, userId);
}

function mapRepost(rp: any, userId: string | null): FeedItem {
  const r = rp.rmhark;
  const isDeleted = !!r.deletedAt;
  const item: FeedItem = {
    id: `repost:${rp.id}`,
    type: "rmhark",
    createdAt: rp.createdAt.toISOString(),
    actualId: r.id,
    content: isDeleted ? deletedMessageFor(r) : r.content,
    user: resolveUser(r.user),
    likeCount: r.likeCount,
    commentCount: r.commentCount,
    repostCount: r.repostCount,
    viewCount: r.viewCount,
    liked: userId ? r.likes?.length > 0 : false,
    reposted: userId ? r.reposts?.length > 0 : false,
    bookmarked: userId ? r.bookmarks?.length > 0 : false,
    repostedBy: resolveUser(rp.user),
    original: mapOriginal(r.original),
    poll: isDeleted ? undefined : mapPoll(r.poll),
    gifUrl: isDeleted ? undefined : (r.gifUrl ?? undefined),
    imageUrls: isDeleted ? undefined : r.imageUrls,
    imageAlts: isDeleted ? undefined : r.imageAlts,
    isSensitive: isDeleted ? false : (r.isSensitive ?? false),
    replyControl: r.replyControl ?? 'EVERYONE',
    reactions: groupReactions(r.reactions ?? [], userId),
    deletedAt: r.deletedAt?.toISOString() || null,
    deletedByAdmin: r.deletedByAdmin,
  };
  return isDeleted ? item : applyLock(item, r, userId);
}

/**
 * The raw `(createdAt, id)` keyset for an emitted item — the repost record id
 * for reposts, otherwise the post id. Used to build the next-page cursor.
 */
function keysetOf(item: FeedItem): { createdAt: string; id: string } {
  const id = item.id.startsWith("repost:") ? item.id.slice("repost:".length) : item.id;
  return { createdAt: item.createdAt, id };
}

/* ------------------------------------------------------------------ */
/*  Announcements (virtual feed items from static data sources)         */
/* ------------------------------------------------------------------ */

async function getAnnouncementItems(filter: FeedFilter): Promise<FeedItem[]> {
  // Announcements are static (games/apps catalogs) or slow-moving (blog posts),
  // yet this runs on every feed read *and* every pagination. Cache per-filter for
  // a minute so the feed's hot path stops re-querying blog posts each time; a
  // freshly published blog post surfaces within the TTL.
  const cacheKey = `feed:announcements:${filter}`;
  const cached = apiCache.get<FeedItem[]>(cacheKey);
  if (cached) return cached;

  const { games } = await import("../games");
  const { apps } = await import("../apps");
  const items: FeedItem[] = [];

  if (filter === "all" || filter === "app" || filter === "game") {
    if (filter === "all" || filter === "game") {
      for (const g of games) {
        items.push({
          id: `build:${g.id}`,
          type: "game_announcement",
          createdAt: "2025-01-01T00:00:00.000Z",
          title: g.title,
          description: g.description,
          href: g.href,
          imagePath: g.imagePath,
          tags: g.tags,
          gradient: g.gradient,
          iconName: g.iconName,
        });
      }
    }
    if (filter === "all" || filter === "app") {
      for (const a of apps) {
        if (a.hidden) continue;
        items.push({
          id: `build:${a.id}`,
          type: "app_announcement",
          createdAt: "2025-01-01T00:00:00.000Z",
          title: a.title,
          description: a.description,
          href: a.href,
          imagePath: a.imagePath,
          tags: a.tags,
          gradient: a.gradient,
          iconName: a.iconName,
        });
      }
    }
  }

  if (filter === "all" || filter === "blog") {
    const posts = await getAllPosts(["title", "date", "slug", "description", "image", "tags"]);
    for (const p of posts) {
      items.push({
        id: `blog:${p.slug}`,
        type: "blog",
        createdAt: p.date ? new Date(p.date).toISOString() : "2025-01-01T00:00:00.000Z",
        title: p.title,
        description: p.description,
        href: `/blog/${p.slug}`,
        imagePath: p.image,
        tags: p.tags as unknown as string[] | undefined,
      });
    }
  }

  apiCache.set(cacheKey, items, 60_000);
  return items;
}

/* ------------------------------------------------------------------ */
/*  Following surface (follow-graph home, strict reverse-chron)         */
/* ------------------------------------------------------------------ */

async function getFollowingTimeline(
  params: GetTimelineParams
): Promise<TimelineResult> {
  const { userId, cursor, limit, search } = params;
  if (!userId) {
    return { items: [], nextCursor: null, hasMore: false, empty: true };
  }

  const [followRecords, hiddenIds] = await Promise.all([
    prisma.follow.findMany({
      where: { followerId: userId },
      select: { followingId: true },
    }),
    getHiddenAuthorIds(userId),
  ]);
  // Exclude muted/blocked authors even if still followed.
  const hiddenSet = new Set(hiddenIds);
  const followingIds = followRecords
    .map((f) => f.followingId)
    .filter((id) => !hiddenSet.has(id));

  if (followingIds.length === 0) {
    return { items: [], nextCursor: null, hasMore: false, empty: true };
  }

  const decoded = decodeCursor(cursor);
  const keyset = keysetWhere(decoded);
  const contentWhere = search
    ? { content: { contains: search, mode: "insensitive" as const } }
    : {};
  const include = rmharkInclude(userId);

  const [rmharks, repostRecords] = await Promise.all([
    prisma.rMHark.findMany({
      where: {
        userId: { in: followingIds },
        deletedAt: null,
        audience: { not: "PRIVATE" },
        communityId: null,
        // Only thread roots + standalone posts in the feed; follow-up segments
        // (threadRootId set) are read on the thread page.
        threadRootId: null,
        ...contentWhere,
        ...keyset,
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit,
      include,
    }),
    prisma.rMHarkRepost.findMany({
      where: {
        userId: { in: followingIds },
        rmhark: {
          deletedAt: null,
          ...contentWhere,
          ...(hiddenIds.length ? { userId: { notIn: hiddenIds } } : {}),
        },
        ...keyset,
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit,
      include: {
        user: { select: userDisplaySelect },
        rmhark: { include },
      },
    }),
  ]);

  const merged = [
    ...rmharks.map((r) => mapOwn(r, userId)),
    ...repostRecords.map((rp) => mapRepost(rp, userId)),
  ].sort(compareKeysetDesc);

  const items = deduplicateReposts(merged).slice(0, limit);

  const nextCursor =
    items.length === limit
      ? (() => {
          const k = keysetOf(items[items.length - 1]);
          return encodeCursor(k.createdAt, k.id);
        })()
      : null;

  return { items, nextCursor, hasMore: items.length === limit };
}

/* ------------------------------------------------------------------ */
/*  For-You surface (global; chrono + announcements, ranking seam)      */
/* ------------------------------------------------------------------ */

async function getForYouTimeline(
  params: GetTimelineParams
): Promise<TimelineResult> {
  const { userId, cursor, limit, search, filter } = params;
  const decoded = decodeCursor(cursor);
  const keyset = keysetWhere(decoded);
  const contentWhere = search
    ? { content: { contains: search, mode: "insensitive" as const } }
    : {};
  const include = rmharkInclude(userId);

  // These reads only depend on the viewer id / filter — not on each other — so
  // fan them out together instead of a serial waterfall. On the feed's hot path
  // this collapses several sequential DB round-trips into one batch:
  //   - hidden authors (blocked/muted, and authors who blocked the viewer)
  //   - the viewer's follow graph (audience visibility + ranking)
  //   - the interest profile (only on the first page, since ranking reorders
  //     within a page window)
  //   - announcements (static/slow-moving; skipped while searching)
  const [hiddenIds, viewerFollowingIds, interest, announcements] = await Promise.all([
    getHiddenAuthorIds(userId),
    userId
      ? prisma.follow
          .findMany({ where: { followerId: userId }, select: { followingId: true } })
          .then((rows) => rows.map((f) => f.followingId))
      : Promise.resolve([] as string[]),
    userId && !cursor ? buildInterestProfile(userId) : Promise.resolve(null),
    search ? Promise.resolve([] as FeedItem[]) : getAnnouncementItems(filter),
  ]);

  const authorWhere = hiddenIds.length ? { userId: { notIn: hiddenIds } } : {};
  const audWhere = audienceWhere(userId, viewerFollowingIds);
  const rankCtx: RankContext = {
    followingIds: new Set(viewerFollowingIds),
    authorAffinity: interest?.authorAffinity,
    topicInterest: interest?.topicInterest,
  };

  const shouldFetchRmharks = filter === "all" || filter === "rmhark" || !!search;
  let dbItems: FeedItem[] = [];

  if (shouldFetchRmharks) {
    const [rmharks, repostRecords] = await Promise.all([
      prisma.rMHark.findMany({
        // threadRootId:null keeps only thread roots + standalone posts in the
        // feed; follow-up segments are read on the thread page.
        where: { deletedAt: null, communityId: null, threadRootId: null, ...contentWhere, ...authorWhere, ...audWhere, ...keyset },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: limit,
        include,
      }),
      prisma.rMHarkRepost.findMany({
        where: {
          rmhark: { deletedAt: null, ...contentWhere, ...authorWhere, ...audWhere },
          ...(hiddenIds.length ? { userId: { notIn: hiddenIds } } : {}),
          ...keyset,
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: limit,
        include: {
          user: { select: userDisplaySelect },
          rmhark: { include },
        },
      }),
    ]);

    dbItems = deduplicateReposts(
      [
        ...rmharks.map((r) => mapOwn(r, userId)),
        ...repostRecords.map((rp) => mapRepost(rp, userId)),
      ].sort(compareKeysetDesc)
    ).slice(0, limit);

    // Ranking seam (Phase 5) — personalized For-You ordering (#11).
    dbItems = rankCandidates(dbItems, rankCtx);
  }

  // Announcements were fetched above (skipped when searching — only RMHarks
  // have content).
  const cursorDate = decoded?.createdAt;
  const filteredAnnouncements = cursorDate
    ? announcements.filter((a) => new Date(a.createdAt) < cursorDate)
    : announcements;

  let paginatedItems: FeedItem[];

  if (filter === "all") {
    // Interleave: 3 RMHarks per 1 announcement to prioritize user content.
    // Copy before sorting — `announcements` may be a shared cached array.
    const sortedAnnouncements = [...filteredAnnouncements].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
    const result: FeedItem[] = [];
    let ri = 0;
    let ai = 0;
    while (result.length < limit && (ri < dbItems.length || ai < sortedAnnouncements.length)) {
      for (let i = 0; i < 3 && ri < dbItems.length && result.length < limit; i++) {
        result.push(dbItems[ri++]);
      }
      if (ai < sortedAnnouncements.length && result.length < limit) {
        result.push(sortedAnnouncements[ai++]);
      }
    }
    paginatedItems = result;
  } else {
    paginatedItems = [...dbItems, ...filteredAnnouncements]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, limit);
  }

  // Cursor is anchored to the last real DB item (RMHark) — announcements have
  // static dates that would break keyset pagination.
  const lastDbItem = [...paginatedItems].reverse().find((i) => i.type === "rmhark");
  const nextCursor =
    paginatedItems.length === limit && lastDbItem
      ? (() => {
          const k = keysetOf(lastDbItem);
          return encodeCursor(k.createdAt, k.id);
        })()
      : null;

  return {
    items: paginatedItems,
    nextCursor,
    hasMore: paginatedItems.length === limit,
  };
}

/** Compare two emitted items by their `(createdAt, id)` keyset, descending. */
function compareKeysetDesc(a: FeedItem, b: FeedItem): number {
  const ta = new Date(a.createdAt).getTime();
  const tb = new Date(b.createdAt).getTime();
  if (tb !== ta) return tb - ta;
  return keysetOf(b).id.localeCompare(keysetOf(a).id);
}

/* ------------------------------------------------------------------ */
/*  Reader-level muted words (per-viewer content control)               */
/* ------------------------------------------------------------------ */

/** The viewer's muted words (already lowercased on write). Empty when none. */
export async function getMutedWords(userId: string): Promise<string[]> {
  const profile = await prisma.userProfile.findUnique({
    where: { userId },
    select: { mutedWords: true },
  });
  return profile?.mutedWords ?? [];
}

/** True when `text` contains any muted word (case-insensitive substring). */
function contentIsMuted(text: string | undefined, muted: string[]): boolean {
  if (!text) return false;
  const lower = text.toLowerCase();
  return muted.some((w) => w.length > 0 && lower.includes(w));
}

/**
 * Drop RMHark items whose text (or quoted original) matches a muted word.
 * Post-filter only — the keyset cursor is anchored independently, so a slightly
 * shorter page just streams the rest on the next fetch (no gap/overlap).
 */
export function applyMutedWords(items: FeedItem[], muted: string[]): FeedItem[] {
  if (!muted.length) return items;
  return items.filter(
    (it) =>
      it.type !== "rmhark" ||
      !(contentIsMuted(it.content, muted) || contentIsMuted(it.original?.content, muted))
  );
}

/* ------------------------------------------------------------------ */
/*  Public entry point                                                 */
/* ------------------------------------------------------------------ */

export async function getTimeline(params: GetTimelineParams): Promise<TimelineResult> {
  // The muted-words read (reader-level content control) only needs the viewer
  // id, so run it alongside the timeline assembly rather than after it — one
  // fewer serial round-trip on the hot path. Skipped for signed-out viewers.
  const [result, muted] = await Promise.all([
    params.surface === "following"
      ? getFollowingTimeline(params)
      : getForYouTimeline(params),
    params.userId ? getMutedWords(params.userId) : Promise.resolve([] as string[]),
  ]);

  if (!muted.length) return result;
  return { ...result, items: applyMutedWords(result.items, muted) };
}
