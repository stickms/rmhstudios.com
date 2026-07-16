import { prisma } from '@/lib/prisma.server';
import { rmharkInclude, mapRmharkToFeedItem } from '@/lib/feed/map-feed-item.server';
import { userDisplaySelect, resolveUser } from '@/lib/user-display';
import { getHiddenAuthorIds } from '@/lib/moderation.server';
import { audienceWhere } from '@/lib/feed/audience.server';
import { getMutedWords, applyMutedWords } from '@/lib/feed/timeline';
import type { FeedItem } from '@/lib/feed-types';

const HASHTAG_REGEX = /#(\w{1,64})/g;
const SCAN_LIMIT = 400;

/**
 * Half-life (hours) for trending recency decay. A tag used 24h ago counts half
 * as much as one used now, so "trending" reflects current velocity rather than
 * a raw tally over the whole scan window (which gets stuck on evergreen tags).
 * Mirrors the decay approach in `lib/feed/ranking.ts`.
 */
const TREND_HALF_LIFE_HOURS = 24;

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

/**
 * Explore payload: trending tags, hot posts, people to follow, and communities
 * to discover — scoped to `viewerId` (excludes self/followed/hidden).
 *
 * Shared by the `/api/explore` GET handler and the `/explore` route loader so
 * the page is server-rendered / prefetched instead of fetched client-side on
 * mount. FeedItem dates are already serialized to ISO strings by
 * `mapRmharkToFeedItem`.
 */
export async function listExplore(viewerId: string | null): Promise<ExploreResult> {
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  // Wave 1 — everything that depends only on the viewer id (or nothing). These
  // were previously four separate serial awaits scattered through the function.
  const [hidden, following, muted, communities] = await Promise.all([
    getHiddenAuthorIds(viewerId),
    viewerId
      ? prisma.follow.findMany({ where: { followerId: viewerId }, select: { followingId: true } })
      : Promise.resolve([] as { followingId: string }[]),
    viewerId ? getMutedWords(viewerId) : Promise.resolve([] as string[]),
    // Communities to discover: most members first, public only. Independent of
    // the viewer's graph, so it rides wave 1 instead of trailing at the end.
    prisma.community.findMany({
      where: { isPrivate: false },
      orderBy: { memberCount: 'desc' },
      take: 6,
      select: { id: true, slug: true, name: true, description: true, icon: true, color: true, memberCount: true },
    }),
  ]);

  const notHidden = hidden.length ? { userId: { notIn: hidden } } : {};
  const followingIds = following.map((f) => f.followingId);
  const aud = audienceWhere(viewerId, followingIds);
  // People to follow: top by followers, excluding self/followed/hidden.
  const excludeIds = new Set<string>([
    ...(viewerId ? [viewerId] : []),
    ...followingIds,
    ...hidden,
  ]);

  // Wave 2 — the three reads that need hidden/following, run together.
  const [recent, hotRows, candidates] = await Promise.all([
    prisma.rMHark.findMany({
      where: { deletedAt: null, content: { contains: '#' }, ...notHidden, ...aud },
      select: { content: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
      take: SCAN_LIMIT,
    }),
    prisma.rMHark.findMany({
      where: { deletedAt: null, createdAt: { gte: since }, ...notHidden, ...aud },
      orderBy: [{ likeCount: 'desc' }, { createdAt: 'desc' }],
      take: 15,
      include: rmharkInclude(viewerId),
    }),
    prisma.user.findMany({
      where: { isBot: false, id: { notIn: [...excludeIds] } },
      select: { ...userDisplaySelect, _count: { select: { followers: true } } },
      orderBy: { followers: { _count: 'desc' } },
      take: 8,
    }),
  ]);

  // Trending tags — weighted by recency so the list reflects what's hot *now*,
  // not whatever tag has accumulated the most all-time uses in the scan window.
  // `count` stays the raw occurrence count (for display); `score` is the
  // recency-decayed weight used only for ordering.
  const now = Date.now();
  const counts = new Map<string, { tag: string; count: number; score: number }>();
  for (const p of recent) {
    const ageHours = Math.max(0, (now - p.createdAt.getTime()) / 3_600_000);
    const weight = Math.pow(0.5, ageHours / TREND_HALF_LIFE_HOURS);
    for (const m of p.content.matchAll(HASHTAG_REGEX)) {
      const key = m[1].toLowerCase();
      const e = counts.get(key);
      if (e) {
        e.count += 1;
        e.score += weight;
      } else {
        counts.set(key, { tag: m[1], count: 1, score: weight });
      }
    }
  }
  const trendingTags = [...counts.values()]
    .sort((a, b) => b.score - a.score || a.tag.localeCompare(b.tag))
    .slice(0, 12)
    .map(({ tag, count }) => ({ tag, count }));

  // Apply the viewer's muted words to hot posts too (the timeline already does;
  // explore would otherwise be a mute-filter bypass). `muted` came from wave 1.
  const hotPosts = applyMutedWords(
    hotRows.filter((r) => (r.likeCount ?? 0) > 0).map((r) => mapRmharkToFeedItem(r, viewerId)),
    muted,
  );

  const suggestedUsers = candidates.map((u) => ({
    ...resolveUser(u),
    followerCount: u._count.followers,
  }));

  return { trendingTags, hotPosts, suggestedUsers, communities };
}
