import { prisma } from '@/lib/prisma.server';
import { rmharkInclude, mapRmharkToFeedItem } from '@/lib/feed/map-feed-item.server';
import { userDisplaySelect, resolveUser } from '@/lib/user-display';
import { getHiddenAuthorIds } from '@/lib/moderation.server';
import { audienceWhere } from '@/lib/feed/audience.server';
import type { FeedItem } from '@/lib/feed-types';

const HASHTAG_REGEX = /#(\w{1,64})/g;
const SCAN_LIMIT = 400;

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
  const hidden = await getHiddenAuthorIds(viewerId);
  const notHidden = hidden.length ? { userId: { notIn: hidden } } : {};
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const following = viewerId
    ? await prisma.follow.findMany({ where: { followerId: viewerId }, select: { followingId: true } })
    : [];
  const aud = audienceWhere(viewerId, following.map((f) => f.followingId));

  const [recent, hotRows] = await Promise.all([
    prisma.rMHark.findMany({
      where: { deletedAt: null, content: { contains: '#' }, ...notHidden, ...aud },
      select: { content: true },
      orderBy: { createdAt: 'desc' },
      take: SCAN_LIMIT,
    }),
    prisma.rMHark.findMany({
      where: { deletedAt: null, createdAt: { gte: since }, ...notHidden, ...aud },
      orderBy: [{ likeCount: 'desc' }, { createdAt: 'desc' }],
      take: 15,
      include: rmharkInclude(viewerId),
    }),
  ]);

  // Trending tags.
  const counts = new Map<string, { tag: string; count: number }>();
  for (const p of recent) {
    for (const m of p.content.matchAll(HASHTAG_REGEX)) {
      const key = m[1].toLowerCase();
      const e = counts.get(key);
      if (e) e.count += 1;
      else counts.set(key, { tag: m[1], count: 1 });
    }
  }
  const trendingTags = [...counts.values()]
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag))
    .slice(0, 12);

  const hotPosts = hotRows
    .filter((r) => (r.likeCount ?? 0) > 0)
    .map((r) => mapRmharkToFeedItem(r, viewerId));

  // People to follow: top by followers, excluding self/followed/hidden.
  const excludeIds = new Set<string>([
    ...(viewerId ? [viewerId] : []),
    ...following.map((f) => f.followingId),
    ...hidden,
  ]);
  const candidates = await prisma.user.findMany({
    where: { isBot: false, id: { notIn: [...excludeIds] } },
    select: { ...userDisplaySelect, _count: { select: { followers: true } } },
    orderBy: { followers: { _count: 'desc' } },
    take: 8,
  });
  const suggestedUsers = candidates.map((u) => ({
    ...resolveUser(u),
    followerCount: u._count.followers,
  }));

  // Communities to discover: most members first, public only.
  const communities = await prisma.community.findMany({
    where: { isPrivate: false },
    orderBy: { memberCount: 'desc' },
    take: 6,
    select: { id: true, slug: true, name: true, description: true, icon: true, color: true, memberCount: true },
  });

  return { trendingTags, hotPosts, suggestedUsers, communities };
}
