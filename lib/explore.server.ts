import { prisma } from '@/lib/prisma.server';
import { rmharkIncludeLite, mapRmharksWithBoundedReactions } from '@/lib/feed/map-feed-item.server';
import { userDisplaySelect, resolveUser } from '@/lib/user-display';
import { getHiddenAuthorIds } from '@/lib/moderation.server';
import { audienceWhere } from '@/lib/feed/audience.server';
import { getMutedWords, applyMutedWords } from '@/lib/feed/timeline';
import { cached } from '@/lib/cached.server';
import type { FeedItem } from '@/lib/feed-types';

export interface ExploreResult {
  trendingTags: { tag: string; count: number }[];
  hotPosts: FeedItem[];
  suggestedUsers: Array<ReturnType<typeof resolveUser> & { followerCount: number }>;
  communities: Array<{
    id: string;
    slug: string;
    name: string;
    description: string | null;
    icon: string | null;
    color: string | null;
    memberCount: number;
  }>;
}

/** The viewer-independent, shareable slice of the explore payload. */
type ExploreBase = {
  trendingTags: ExploreResult['trendingTags'];
  communities: ExploreResult['communities'];
  /** A pool of top candidates; per-viewer excludes are applied after. */
  userPool: ExploreResult['suggestedUsers'];
};

/** How many hot posts to show, and how big the suggested-user candidate pool is. */
const HOT_POSTS_TAKE = 15;
const SUGGESTED_TAKE = 8;
const USER_POOL_TAKE = 50;

/**
 * The parts of explore that don't depend on the viewer: trending tags (from the
 * denormalized `hashtag` table), public communities, and a pool of popular users
 * to suggest. Shared across all viewers and cached ~120s so it isn't recomputed
 * per request. Per-viewer work (hot posts, exclude-self/followed) is applied by
 * the caller on top of this.
 */
async function loadExploreBase(): Promise<ExploreBase> {
  const [trending, communities, userPool] = await Promise.all([
    // Trending: indexed order by the denormalized post count — no content scan.
    prisma.hashtag.findMany({
      orderBy: { postCount: 'desc' },
      take: 12,
      select: { tag: true, postCount: true },
    }),
    // Communities to discover: most members first, public only.
    prisma.community.findMany({
      where: { isPrivate: false },
      orderBy: { memberCount: 'desc' },
      take: 6,
      select: {
        id: true,
        slug: true,
        name: true,
        description: true,
        icon: true,
        color: true,
        memberCount: true,
      },
    }),
    // Popular real users; the per-viewer exclude (self/followed/hidden) is a
    // small filter applied after, so we cache a slightly larger pool than we
    // ultimately show.
    prisma.user.findMany({
      where: { isBot: false },
      select: { ...userDisplaySelect, followerCount: true },
      orderBy: { followerCount: 'desc' },
      take: USER_POOL_TAKE,
    }),
  ]);

  return {
    trendingTags: trending.map((t) => ({ tag: t.tag, count: t.postCount })),
    communities,
    userPool: userPool.map((u) => ({ ...resolveUser(u), followerCount: u.followerCount })),
  };
}

/**
 * Explore payload: trending tags, hot posts, people to follow, and communities
 * to discover — scoped to `viewerId` (excludes self/followed/hidden).
 *
 * Shared by the `/api/explore` GET handler and the `/explore` route loader so
 * the page is server-rendered / prefetched instead of fetched client-side on
 * mount. FeedItem dates are already serialized to ISO strings by
 * `mapRmharkToFeedItem`.
 */
/**
 * Size of the viewer-independent hot-post candidate pool (perf audit §2.4).
 * We rank the top public posts of the last 7 days ONCE (cached, shared) into a
 * candidate id list, then each viewer hydrates just those ids. That moves the
 * expensive 7-day scan-and-sort-by-likeCount off the per-request path — it ran
 * per viewer per explore view before, sorting 10^5–10^6 rows each time.
 */
const HOT_CANDIDATE_POOL = 100;

/**
 * Viewer-independent hot-post candidates: ids of the most-liked PUBLIC posts in
 * the last 7 days. PUBLIC-only by design — explore is a discovery surface, and
 * scoping candidates to public content is what lets the pool be shared across
 * all viewers (each viewer's audience/hidden/mute filters still apply on top
 * during hydration below).
 */
async function loadHotPostCandidateIds(): Promise<string[]> {
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const rows = await prisma.rMHark.findMany({
    where: { deletedAt: null, createdAt: { gte: since }, audience: 'PUBLIC', likeCount: { gt: 0 } },
    orderBy: [{ likeCount: 'desc' }, { createdAt: 'desc' }],
    take: HOT_CANDIDATE_POOL,
    select: { id: true },
  });
  return rows.map((r) => r.id);
}

export async function listExplore(viewerId: string | null): Promise<ExploreResult> {
  // Viewer-independent slices — cached and shared across all viewers.
  const [base, hotCandidateIds] = await Promise.all([
    cached('explore:list', 120_000, loadExploreBase),
    cached('explore:hot-candidates', 60_000, loadHotPostCandidateIds),
  ]);

  // Per-viewer inputs for hot posts (audience/mute) and the suggested-user
  // exclude set. These are cheap indexed reads.
  const [hidden, following, muted] = await Promise.all([
    getHiddenAuthorIds(viewerId),
    viewerId
      ? prisma.follow.findMany({ where: { followerId: viewerId }, select: { followingId: true } })
      : Promise.resolve([] as { followingId: string }[]),
    viewerId ? getMutedWords(viewerId) : Promise.resolve([] as string[]),
  ]);

  const notHidden = hidden.length ? { userId: { notIn: hidden } } : {};
  const followingIds = following.map((f) => f.followingId);
  const aud = audienceWhere(viewerId, followingIds);

  // Hydrate the shared candidate pool with this viewer's state (likes/reposts/
  // bookmarks via the include) and apply the viewer's hidden-author filter. The
  // candidates are already PUBLIC, so `aud` is a no-op guard here — kept for
  // defense in depth. This is a bounded primary-key `IN` lookup, not a 7-day
  // scan. Order isn't guaranteed by an `IN` query, so re-sort by likeCount.
  const hotRows = hotCandidateIds.length
    ? await prisma.rMHark.findMany({
        where: { id: { in: hotCandidateIds }, deletedAt: null, ...notHidden, ...aud },
        include: rmharkIncludeLite(viewerId),
      })
    : [];
  hotRows.sort(
    (a, b) =>
      (b.likeCount ?? 0) - (a.likeCount ?? 0) || b.createdAt.getTime() - a.createdAt.getTime(),
  );

  // Apply the viewer's muted words to hot posts too (the timeline already does;
  // explore would otherwise be a mute-filter bypass), then take the display slice.
  // Reactions load as bounded aggregates for the whole slice (perf audit §2.3).
  const displayRows = hotRows.filter((r) => (r.likeCount ?? 0) > 0).slice(0, HOT_POSTS_TAKE);
  const hotPosts = applyMutedWords(
    await mapRmharksWithBoundedReactions(displayRows, viewerId),
    muted,
  );

  // People to follow: the cached pool minus self/followed/hidden.
  const excludeIds = new Set<string>([...(viewerId ? [viewerId] : []), ...followingIds, ...hidden]);
  const suggestedUsers = base.userPool
    .filter((u) => !excludeIds.has(u.id))
    .slice(0, SUGGESTED_TAKE);

  return {
    trendingTags: base.trendingTags,
    hotPosts,
    suggestedUsers,
    communities: base.communities,
  };
}
