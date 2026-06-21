import { createFileRoute } from '@tanstack/react-router';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma.server';
import { rmharkInclude, mapRmharkToFeedItem } from '@/lib/feed/map-feed-item.server';
import { userDisplaySelect, resolveUser } from '@/lib/user-display';
import { getHiddenAuthorIds } from '@/lib/moderation.server';

const HASHTAG_REGEX = /#(\w{1,64})/g;
const SCAN_LIMIT = 400;

/** GET /api/explore — trending tags, hot posts, and people to follow. */
export const Route = createFileRoute('/api/explore')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const session = await auth.api.getSession({ headers: request.headers }).catch(() => null);
          const viewerId = session?.user?.id ?? null;
          const hidden = await getHiddenAuthorIds(viewerId);
          const notHidden = hidden.length ? { userId: { notIn: hidden } } : {};
          const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

          const [recent, hotRows, following] = await Promise.all([
            prisma.rMHark.findMany({
              where: { deletedAt: null, content: { contains: '#' }, ...notHidden },
              select: { content: true },
              orderBy: { createdAt: 'desc' },
              take: SCAN_LIMIT,
            }),
            prisma.rMHark.findMany({
              where: { deletedAt: null, createdAt: { gte: since }, ...notHidden },
              orderBy: [{ likeCount: 'desc' }, { createdAt: 'desc' }],
              take: 15,
              include: rmharkInclude(viewerId),
            }),
            viewerId
              ? prisma.follow.findMany({ where: { followerId: viewerId }, select: { followingId: true } })
              : Promise.resolve([]),
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

          return Response.json(
            { trendingTags, hotPosts, suggestedUsers },
            { headers: { 'Cache-Control': 'public, max-age=60' } }
          );
        } catch (error) {
          console.error('Explore error:', error);
          return Response.json({ trendingTags: [], hotPosts: [], suggestedUsers: [] });
        }
      },
    },
  },
});
