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

import { Prisma } from "@prisma/client";
import { prisma } from "../prisma.server";
import type { FeedItem, FeedFilter, FeedPoll } from "../feed-types";
import type { ResolvedUser } from "../user-display";
import { getUserDisplayMap } from "../user-display.server";
import { getAllPosts } from "../blog";
import { decodeCursor, encodeCursor, keysetWhere } from "./cursor";
import { rankCandidates, type RankContext } from "./ranking";
import { buildInterestProfile } from "./personalize.server";
import { getHiddenAuthorIds } from "../moderation.server";
import { getFollowingIds } from "../social/follow-graph.server";
import { audienceWhere } from "./audience.server";
import { applyLock } from "./map-feed-item.server";
import type { ReactionSummary } from "../social/reactions";
import { apiCache } from "../cache";
import { cachedSWR } from "../cached.server";

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
  /** The viewer's muted words (signed-in only), returned so the client can filter
   *  live SSE posts without a second round-trip to /api/preferences/muted-words. */
  mutedWords?: string[];
}

/* ------------------------------------------------------------------ */
/*  Content search (FTS id resolution)                                  */
/* ------------------------------------------------------------------ */

/** Cap on FTS-matched ids fed into the feed query's `id IN (...)` filter. */
const SEARCH_ID_CAP = 1000;

/**
 * Resolve the ids of posts whose content matches `search`, using the
 * `content_tsv` full-text index (rmheet_content_tsv_idx) instead of an
 * unindexed `content ILIKE '%…%'` full-table scan. Returns a bounded,
 * recency-ordered id set; the caller folds it into its Prisma `where` as
 * `id: { in: [...] }`, so every audience / deleted / following / community
 * filter and the keyset cursor still apply on top — behaviour matches the old
 * `contains` filter, just index-backed. Mirrors app/routes/api/search.ts's
 * `searchPosts`; `content_tsv` is a raw-SQL migration column (not in
 * schema.prisma), hence `$queryRaw`. Fully parameterised — no interpolation.
 */
async function resolveSearchPostIds(search: string): Promise<string[]> {
  const rows = await prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
    SELECT id
    FROM rmheet
    WHERE "deletedAt" IS NULL
      AND content_tsv @@ websearch_to_tsquery('simple', ${search})
    ORDER BY "createdAt" DESC, id DESC
    LIMIT ${SEARCH_ID_CAP}
  `);
  return rows.map((r) => r.id);
}

/**
 * Build the content-search fragment of a feed `where`. Empty when not
 * searching; otherwise an `id: { in: [...] }` filter over the FTS-matched ids
 * (works identically as a top-level RMHark filter and nested under a repost's
 * `rmhark`). An empty match set yields `{ in: [] }`, i.e. no rows.
 */
async function searchContentWhere(search: string | null): Promise<Record<string, unknown>> {
  if (!search) return {};
  const ids = await resolveSearchPostIds(search);
  return { id: { in: ids } };
}

/* ------------------------------------------------------------------ */
/*  Poll helpers                                                       */
/* ------------------------------------------------------------------ */

function pollInclude(userId: string | null) {
  return {
    include: {
      options: {
        orderBy: { position: "asc" as const },
        // `voteCount` is the denormalized per-option tally column (maintained
        // atomically by the vote route), so the feed read no longer aggregates
        // `_count.votes` per option on every render. The scalar column is
        // returned by default; only the viewer's own vote still needs a bounded
        // relation include.
        ...(userId
          ? { include: { votes: { where: { userId }, select: { id: true, optionId: true } } } }
          : {}),
      },
    },
  };
}

function mapPoll(poll: any): FeedPoll | undefined {
  if (!poll) return undefined;
  const totalVotes = poll.options.reduce(
    (sum: number, o: { voteCount?: number }) => sum + (o.voteCount ?? 0),
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
      voteCount: o.voteCount ?? 0,
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
    // Author display (profile + equipped cosmetics) is NOT joined per row. It is
    // viewer-independent and changes rarely, so it's resolved after the query via
    // getUserDisplayMap (batched + cached cross-viewer, keyed by the scalar
    // `userId` column) — see lib/user-display.server.ts. This drops ~40 profile+
    // inventory relation fan-outs per 20-item page off the hottest query.
    //
    // Emoji reactions are NOT included here either. Fetching every reaction row per
    // post is unbounded — a single viral post can carry thousands, ballooning the
    // feed query. The feed only needs per-emoji counts + whether the viewer
    // reacted, loaded as bounded aggregates after the query (loadReactionSummaries).
    ...(userId
      ? {
          likes: { where: { userId }, select: { id: true } },
          reposts: { where: { userId }, select: { id: true } },
          bookmarks: { where: { userId }, select: { id: true } },
          unlocks: { where: { userId }, select: { id: true } },
        }
      : {}),
    poll: pollInclude(userId),
    // Quoted original: scalar fields only (incl. its `userId`); its author is
    // resolved through the same display map.
    original: true,
  } as const;
}

/** Minimal author-bearing shapes the id collector reads (structurally satisfied
 *  by the richer Prisma rows). Typed rather than `any` to avoid lint noise. */
type AuthoredRow = { userId: string; original?: { userId: string } | null };
type RepostRow = { userId: string; rmhark?: AuthoredRow | null };

/**
 * Collect every distinct author id referenced by a fetched page — post authors,
 * quoted-original authors, and reposters — so their display objects can be
 * batch-resolved once (via getUserDisplayMap) instead of joined per row.
 */
function collectAuthorIds(rmharks: AuthoredRow[], repostRecords: RepostRow[]): string[] {
  const ids: string[] = [];
  for (const r of rmharks) {
    ids.push(r.userId);
    if (r.original?.userId) ids.push(r.original.userId);
  }
  for (const rp of repostRecords) {
    ids.push(rp.userId);
    if (rp.rmhark?.userId) ids.push(rp.rmhark.userId);
    if (rp.rmhark?.original?.userId) ids.push(rp.rmhark.original.userId);
  }
  return ids;
}

/** Look up a resolved author from the display map, with a safe fallback for the
 *  (practically impossible) case of an author missing from the batch. */
function displayUser(map: Map<string, ResolvedUser>, userId: string): ResolvedUser {
  return (
    map.get(userId) ?? {
      id: userId,
      name: null,
      image: null,
      username: null,
      handle: null,
      isVerified: false,
      isAdmin: false,
    }
  );
}

/**
 * Load per-post reaction summaries (emoji → count + whether the viewer reacted)
 * with two BOUNDED queries instead of fetching every reaction row per post:
 *   - a `groupBy` over (post, emoji) → counts (bounded by distinct emojis, tiny)
 *   - the viewer's own reactions on these posts (bounded — a viewer reacts to few)
 * The full "who reacted" roster is never needed for the feed; it stays a separate
 * on-demand read. Keyed by post id so callers can attach to both posts and reposts.
 */
async function loadReactionSummaries(
  postIds: string[],
  userId: string | null,
): Promise<Map<string, ReactionSummary[]>> {
  const result = new Map<string, ReactionSummary[]>();
  const ids = [...new Set(postIds)];
  if (ids.length === 0) return result;

  const [grouped, mine] = await Promise.all([
    prisma.rMHarkReaction.groupBy({
      by: ["rmheetId", "emoji"],
      where: { rmheetId: { in: ids } },
      _count: { _all: true },
    }),
    userId
      ? prisma.rMHarkReaction.findMany({
          where: { rmheetId: { in: ids }, userId },
          select: { rmheetId: true, emoji: true },
        })
      : Promise.resolve([] as { rmheetId: string; emoji: string }[]),
  ]);

  const mineSet = new Set(mine.map((m) => `${m.rmheetId} ${m.emoji}`));
  for (const g of grouped) {
    const list = result.get(g.rmheetId) ?? [];
    list.push({
      emoji: g.emoji,
      count: g._count._all,
      reactedByMe: mineSet.has(`${g.rmheetId} ${g.emoji}`),
    });
    result.set(g.rmheetId, list);
  }
  // Match the previous ordering: most-used emoji first.
  for (const list of result.values()) list.sort((a, b) => b.count - a.count);
  return result;
}

/** Fill in each rmhark item's `reactions` from a pre-loaded summary map (mutates). */
function attachReactions(items: FeedItem[], summaries: Map<string, ReactionSummary[]>): void {
  for (const item of items) {
    if (item.type !== "rmhark") continue;
    // For a repost, the reactions belong to the underlying post (actualId).
    item.reactions = summaries.get(item.actualId ?? item.id) ?? [];
  }
}

function deletedMessageFor(record: { deletedByAdmin?: boolean }): string {
  return record.deletedByAdmin
    ? "[This RMHark was deleted by an admin]"
    : "[This RMHark was deleted by the user]";
}

function mapOriginal(o: any, displayMap: Map<string, ResolvedUser>): FeedItem | undefined {
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
    user: displayUser(displayMap, o.userId),
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

function mapOwn(r: any, userId: string | null, displayMap: Map<string, ResolvedUser>): FeedItem {
  const isDeleted = !!r.deletedAt;
  const item: FeedItem = {
    id: r.id,
    type: "rmhark",
    createdAt: r.createdAt.toISOString(),
    content: isDeleted ? deletedMessageFor(r) : r.content,
    user: displayUser(displayMap, r.userId),
    likeCount: r.likeCount,
    commentCount: r.commentCount,
    repostCount: r.repostCount,
    viewCount: r.viewCount,
    liked: userId ? r.likes?.length > 0 : false,
    reposted: userId ? r.reposts?.length > 0 : false,
    bookmarked: userId ? r.bookmarks?.length > 0 : false,
    edited: !!r.editedAt,
    original: mapOriginal(r.original, displayMap),
    poll: isDeleted ? undefined : mapPoll(r.poll),
    gifUrl: isDeleted ? undefined : (r.gifUrl ?? undefined),
    imageUrls: isDeleted ? undefined : r.imageUrls,
    imageAlts: isDeleted ? undefined : r.imageAlts,
    isSensitive: isDeleted ? false : (r.isSensitive ?? false),
    replyControl: r.replyControl ?? 'EVERYONE',
    reactions: [], // filled in by loadReactionSummaries after the query
    threadReplyCount: r.threadReplyCount ?? 0,
    deletedAt: r.deletedAt?.toISOString() || null,
    deletedByAdmin: r.deletedByAdmin,
  };
  return isDeleted ? item : applyLock(item, r, userId);
}

function mapRepost(rp: any, userId: string | null, displayMap: Map<string, ResolvedUser>): FeedItem {
  const r = rp.rmhark;
  const isDeleted = !!r.deletedAt;
  const item: FeedItem = {
    id: `repost:${rp.id}`,
    type: "rmhark",
    createdAt: rp.createdAt.toISOString(),
    actualId: r.id,
    content: isDeleted ? deletedMessageFor(r) : r.content,
    user: displayUser(displayMap, r.userId),
    likeCount: r.likeCount,
    commentCount: r.commentCount,
    repostCount: r.repostCount,
    viewCount: r.viewCount,
    liked: userId ? r.likes?.length > 0 : false,
    reposted: userId ? r.reposts?.length > 0 : false,
    bookmarked: userId ? r.bookmarks?.length > 0 : false,
    repostedBy: displayUser(displayMap, rp.userId),
    original: mapOriginal(r.original, displayMap),
    poll: isDeleted ? undefined : mapPoll(r.poll),
    gifUrl: isDeleted ? undefined : (r.gifUrl ?? undefined),
    imageUrls: isDeleted ? undefined : r.imageUrls,
    imageAlts: isDeleted ? undefined : r.imageAlts,
    isSensitive: isDeleted ? false : (r.isSensitive ?? false),
    replyControl: r.replyControl ?? 'EVERYONE',
    reactions: [], // filled in by loadReactionSummaries after the query
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

  const [followingAll, hiddenIds] = await Promise.all([
    getFollowingIds(userId),
    getHiddenAuthorIds(userId),
  ]);
  // Exclude muted/blocked authors even if still followed.
  const hiddenSet = new Set(hiddenIds);
  const followingIds = followingAll.filter((id) => !hiddenSet.has(id));

  if (followingIds.length === 0) {
    return { items: [], nextCursor: null, hasMore: false, empty: true };
  }

  const decoded = decodeCursor(cursor);
  const keyset = keysetWhere(decoded);
  // Content search now resolves matching ids via the FTS index (not a `content
  // ILIKE` scan); the resulting `id: { in: [...] }` filter combines with every
  // other WHERE clause below exactly as the old `contains` fragment did.
  const contentWhere = await searchContentWhere(search);
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
        rmhark: { include },
      },
    }),
  ]);

  // Batch-resolve author display objects (post authors, quoted originals,
  // reposters) once instead of joining them per row.
  const displayMap = await getUserDisplayMap(collectAuthorIds(rmharks, repostRecords));

  const merged = [
    ...rmharks.map((r) => mapOwn(r, userId, displayMap)),
    ...repostRecords.map((rp) => mapRepost(rp, userId, displayMap)),
  ].sort(compareKeysetDesc);

  const items = deduplicateReposts(merged).slice(0, limit);

  attachReactions(items, await loadReactionSummaries(items.map((i) => i.actualId ?? i.id), userId));

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
  // Content search resolves matching ids via the FTS index (see
  // searchContentWhere) rather than a `content ILIKE` full scan; the resulting
  // `id: { in: [...] }` filter drops into the WHERE like the old fragment.
  const contentWhere = await searchContentWhere(search);
  const include = rmharkInclude(userId);

  const shouldFetchRmharks = filter === "all" || filter === "rmhark" || !!search;

  // Only the hidden-author set + follow graph gate the main feed query (they shape
  // its WHERE), so resolve just those before it. Everything else is NOT an input to
  // the query — the interest profile only reorders the returned page, and
  // announcements are interleaved afterward — so kicking those off alongside the
  // query keeps them off its critical path. Previously a cold interest-profile read
  // (a likes join) sat in the same batch and delayed the feed query from starting.
  const [hiddenIds, viewerFollowingIds] = await Promise.all([
    getHiddenAuthorIds(userId),
    userId ? getFollowingIds(userId) : Promise.resolve([] as string[]),
  ]);

  // In-flight alongside the main query below (neither gates it).
  const interestPromise =
    shouldFetchRmharks && userId && !cursor ? buildInterestProfile(userId) : Promise.resolve(null);
  // Announcements are a first-page-only garnish. Game/app cards carry a static
  // 2025 date, so on every paginated page (2026 cursor dates) they'd all pass a
  // date filter and get re-interleaved — re-sending duplicate JSON and forcing
  // real posts to be sliced off the page. Skip them entirely once paginating.
  const announcementsPromise: Promise<FeedItem[]> =
    search || cursor ? Promise.resolve([]) : getAnnouncementItems(filter);

  const authorWhere = hiddenIds.length ? { userId: { notIn: hiddenIds } } : {};
  const audWhere = audienceWhere(userId, viewerFollowingIds);

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
          rmhark: { include },
        },
      }),
    ]);

    // Reaction summaries and author-display resolution both depend only on the
    // returned rows — kick both off concurrently (each its own query, or a cache
    // hit) so neither serializes behind the in-memory mapping.
    const reactionsPromise = loadReactionSummaries(
      [...rmharks.map((r) => r.id), ...repostRecords.map((rp) => rp.rmhark.id)],
      userId,
    );
    const displayMap = await getUserDisplayMap(collectAuthorIds(rmharks, repostRecords));

    dbItems = deduplicateReposts(
      [
        ...rmharks.map((r) => mapOwn(r, userId, displayMap)),
        ...repostRecords.map((rp) => mapRepost(rp, userId, displayMap)),
      ].sort(compareKeysetDesc)
    ).slice(0, limit);

    const interest = await interestPromise;
    const rankCtx: RankContext = {
      followingIds: new Set(viewerFollowingIds),
      authorAffinity: interest?.authorAffinity,
      topicInterest: interest?.topicInterest,
    };
    // Ranking seam (Phase 5) — personalized For-You ordering (#11).
    dbItems = rankCandidates(dbItems, rankCtx);

    attachReactions(dbItems, await reactionsPromise);
  }

  // Announcements were kicked off before the feed query (skipped when searching
  // or paginating — only RMHarks have content and only the first page garnishes);
  // await them now for interleaving. Empty on any page past the first.
  const announcements = await announcementsPromise;

  let paginatedItems: FeedItem[];

  if (filter === "all") {
    // Interleave: 3 RMHarks per 1 announcement to prioritize user content.
    // Copy before sorting — `announcements` may be a shared cached array.
    const sortedAnnouncements = [...announcements].sort(
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
    paginatedItems = [...dbItems, ...announcements]
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

const MUTED_WORDS_TTL_MS = 60_000;
const mutedWordsKey = (userId: string) => `muted-words:${userId}`;

/** The viewer's muted words (already lowercased on write). Empty when none.
 *  Cached ~60s and invalidated when the list is saved, so it stops re-querying
 *  the profile row on every feed read. */
export async function getMutedWords(userId: string): Promise<string[]> {
  const cached = apiCache.get<string[]>(mutedWordsKey(userId));
  if (cached) return cached;
  const profile = await prisma.userProfile.findUnique({
    where: { userId },
    select: { mutedWords: true },
  });
  const words = profile?.mutedWords ?? [];
  apiCache.set(mutedWordsKey(userId), words, MUTED_WORDS_TTL_MS);
  return words;
}

/** Drop the cached muted-words list for a user (call after they save the list). */
export function invalidateMutedWords(userId: string): void {
  apiCache.invalidate(mutedWordsKey(userId));
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

const ANON_FIRST_PAGE_TTL_MS = 30_000;
/** Stale-while-revalidate window after the anon TTL: within this the stale page
 *  is served instantly while a single background refresh reassembles it, so a
 *  burst of visitors on TTL expiry no longer each run a cold assemble. */
const ANON_FIRST_PAGE_SWR_MS = 120_000;
/** Cache key for the signed-out For-You first page. Keyed by page size so anon
 *  requests with a non-default `limit` don't collide with the 20-item page.
 *  `v2` namespaces the SWR wrapper shape apart from the pre-SWR raw value. */
const anonFirstPageKey = (limit: number) => `timeline:anon:v2:first:${limit}`;

/** Short TTL for the signed-in first-page cache (Phase 2). Deliberately tiny so
 *  viewer-specific state (liked/reposted/bookmarked/myVotes) is at most this
 *  stale; the SSE stream + optimistic client updates cover the gap in between. */
const SIGNED_IN_FIRST_PAGE_TTL_MS = 15_000;
/** SWR window after the signed-in TTL: the returning viewer gets the last page
 *  instantly (~1ms) while the ~32-query assemble runs in the background, so the
 *  feed skeleton no longer blocks on a cold assemble every 15s under load. */
const SIGNED_IN_FIRST_PAGE_SWR_MS = 45_000;

/**
 * Assemble a timeline page (surface dispatch + reader-level muted-word filter).
 * Pulled out of `getTimeline` so both the cache paths and the uncached path
 * share one implementation and the FeedItem shape stays identical everywhere.
 */
async function assembleTimeline(params: GetTimelineParams): Promise<TimelineResult> {
  // The muted-words read (reader-level content control) only needs the viewer
  // id, so run it alongside the timeline assembly rather than after it — one
  // fewer serial round-trip on the hot path. Skipped for signed-out viewers.
  const [result, muted] = await Promise.all([
    params.surface === "following"
      ? getFollowingTimeline(params)
      : getForYouTimeline(params),
    params.userId ? getMutedWords(params.userId) : Promise.resolve([] as string[]),
  ]);

  // Return the muted words with the page so the client can filter live SSE posts
  // without separately hitting /api/preferences/muted-words at hydration.
  return muted.length
    ? { ...result, items: applyMutedWords(result.items, muted), mutedWords: muted }
    : { ...result, mutedWords: muted };
}

export async function getTimeline(params: GetTimelineParams): Promise<TimelineResult> {
  // The signed-out For-You first page is identical for every visitor, so serve
  // it from a short stale-while-revalidate cache — landing/logged-out traffic
  // never runs full timeline assembly on the hot path. 30s staleness is
  // invisible (the SSE stream still delivers new posts live); the SWR window
  // then keeps the page served instantly while a single background refresh
  // reassembles it, and `cachedSWR`'s single-flight collapses a TTL-expiry
  // burst of visitors into ONE assemble instead of one-per-request.
  const anonCacheable =
    !params.userId &&
    params.surface === "foryou" &&
    params.filter === "all" &&
    !params.cursor &&
    !params.search;
  if (anonCacheable) {
    return cachedSWR(
      anonFirstPageKey(params.limit),
      { ttlMs: ANON_FIRST_PAGE_TTL_MS, swrMs: ANON_FIRST_PAGE_SWR_MS },
      () => assembleTimeline(params),
    );
  }

  // Signed-in first page (no cursor / no search): a short Redis-backed
  // stale-while-revalidate cache per (surface, filter, viewer) so the common
  // "open the app" request returns instantly. The whole result — including this
  // viewer's liked/reposted/bookmarked/myVotes bits — is safe to cache under a
  // viewer-keyed key because it is computed for exactly this viewer. Subsequent
  // (cursored) pages are never cached. `cachedSWR` degrades to pure in-process
  // caching when Redis is unset, so local/single-instance dev is unaffected.
  // With SWR, once warm the viewer never blocks on the ~32-query assemble — the
  // last page serves in ~1ms while a deduped background refresh runs. NOTE:
  // there is no write-through invalidation here (the post / follow write paths
  // live in modules outside this change's scope), so the TTL+SWR window is the
  // sole freshness bound — the client's optimistic updates + SSE cover the
  // viewer's own actions within it.
  const signedInFirstPage = !!params.userId && !params.cursor && !params.search;
  if (signedInFirstPage) {
    return cachedSWR(
      `feed:v2:${params.surface}:${params.filter}:${params.userId}:${params.limit}`,
      { ttlMs: SIGNED_IN_FIRST_PAGE_TTL_MS, swrMs: SIGNED_IN_FIRST_PAGE_SWR_MS },
      () => assembleTimeline(params),
    );
  }

  return assembleTimeline(params);
}
