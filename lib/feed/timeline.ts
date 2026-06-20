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
import { rankCandidates } from "./ranking";

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
    ...(userId
      ? {
          likes: { where: { userId }, select: { id: true } },
          reposts: { where: { userId }, select: { id: true } },
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
    deletedAt: o.deletedAt?.toISOString() || null,
    deletedByAdmin: o.deletedByAdmin,
  };
}

function mapOwn(r: any, userId: string | null): FeedItem {
  const isDeleted = !!r.deletedAt;
  return {
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
    original: mapOriginal(r.original),
    poll: isDeleted ? undefined : mapPoll(r.poll),
    gifUrl: isDeleted ? undefined : (r.gifUrl ?? undefined),
    deletedAt: r.deletedAt?.toISOString() || null,
    deletedByAdmin: r.deletedByAdmin,
  };
}

function mapRepost(rp: any, userId: string | null): FeedItem {
  const r = rp.rmhark;
  const isDeleted = !!r.deletedAt;
  return {
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
    repostedBy: resolveUser(rp.user),
    original: mapOriginal(r.original),
    poll: isDeleted ? undefined : mapPoll(r.poll),
    gifUrl: isDeleted ? undefined : (r.gifUrl ?? undefined),
    deletedAt: r.deletedAt?.toISOString() || null,
    deletedByAdmin: r.deletedByAdmin,
  };
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

  const followRecords = await prisma.follow.findMany({
    where: { followerId: userId },
    select: { followingId: true },
  });
  const followingIds = followRecords.map((f) => f.followingId);

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
        rmhark: { deletedAt: null, ...contentWhere },
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

  const shouldFetchRmharks = filter === "all" || filter === "rmhark" || !!search;
  let dbItems: FeedItem[] = [];

  if (shouldFetchRmharks) {
    const [rmharks, repostRecords] = await Promise.all([
      prisma.rMHark.findMany({
        where: { deletedAt: null, ...contentWhere, ...keyset },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: limit,
        include,
      }),
      prisma.rMHarkRepost.findMany({
        where: { rmhark: { deletedAt: null, ...contentWhere }, ...keyset },
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

    // Ranking seam (Phase 5) — no-op unless RANKING_ENABLED.
    dbItems = rankCandidates(dbItems);
  }

  // Announcements (skip when searching — only RMHarks have content).
  const announcements = search ? [] : await getAnnouncementItems(filter);
  const cursorDate = decoded?.createdAt;
  const filteredAnnouncements = cursorDate
    ? announcements.filter((a) => new Date(a.createdAt) < cursorDate)
    : announcements;

  let paginatedItems: FeedItem[];

  if (filter === "all") {
    // Interleave: 3 RMHarks per 1 announcement to prioritize user content.
    const sortedAnnouncements = filteredAnnouncements.sort(
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
/*  Public entry point                                                 */
/* ------------------------------------------------------------------ */

export async function getTimeline(params: GetTimelineParams): Promise<TimelineResult> {
  return params.surface === "following"
    ? getFollowingTimeline(params)
    : getForYouTimeline(params);
}
