import { createFileRoute } from '@tanstack/react-router';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma.server';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { userDisplaySelect, resolveUser } from '@/lib/user-display';
import { getHiddenAuthorIds } from '@/lib/moderation.server';

/**
 * GET /api/search?q=...&type=all|people|posts|builds|blog
 *
 * Unified search across people, posts, user builds, and blog posts. Returns a
 * grouped payload so the search page can render tabs without extra round-trips.
 */
export const Route = createFileRoute('/api/search')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const ip = getClientIp(request);
        const { allowed } = rateLimit(ip, { limit: 60, windowMs: 60_000, prefix: 'search' });
        if (!allowed) return Response.json({ error: 'Too many requests' }, { status: 429 });

        const url = new URL(request.url);
        const q = url.searchParams.get('q')?.trim();
        const type = url.searchParams.get('type') ?? 'all';
        if (!q || q.length < 2) {
          return Response.json({ people: [], posts: [], builds: [], blog: [] });
        }

        const session = await auth.api.getSession({ headers: request.headers }).catch(() => null);
        const viewerId = session?.user?.id ?? null;
        const contains = { contains: q, mode: 'insensitive' as const };

        const wantPeople = type === 'all' || type === 'people';
        const wantPosts = type === 'all' || type === 'posts';
        const wantBuilds = type === 'all' || type === 'builds';
        const wantBlog = type === 'all' || type === 'blog';

        try {
          const hiddenIds = wantPosts ? await getHiddenAuthorIds(viewerId) : [];

          const [people, posts, builds, blog] = await Promise.all([
            wantPeople
              ? prisma.user.findMany({
                  where: {
                    OR: [{ name: contains }, { username: contains }, { handle: contains }],
                  },
                  select: userDisplaySelect,
                  take: type === 'people' ? 30 : 6,
                })
              : Promise.resolve([]),
            wantPosts
              ? prisma.rMHark.findMany({
                  where: {
                    deletedAt: null,
                    content: contains,
                    ...(hiddenIds.length ? { userId: { notIn: hiddenIds } } : {}),
                  },
                  orderBy: [{ likeCount: 'desc' }, { createdAt: 'desc' }],
                  take: type === 'posts' ? 30 : 6,
                  select: {
                    id: true,
                    content: true,
                    createdAt: true,
                    likeCount: true,
                    user: { select: userDisplaySelect },
                  },
                })
              : Promise.resolve([]),
            wantBuilds
              ? prisma.userBuild.findMany({
                  where: {
                    visibility: 'PUBLIC',
                    OR: [{ title: contains }, { description: contains }],
                  },
                  orderBy: { publishedAt: 'desc' },
                  take: type === 'builds' ? 30 : 6,
                  select: { slug: true, title: true, description: true },
                })
              : Promise.resolve([]),
            wantBlog
              ? prisma.blogPost.findMany({
                  where: { OR: [{ title: contains }, { description: contains }] },
                  orderBy: { createdAt: 'desc' },
                  take: type === 'blog' ? 30 : 5,
                  select: { slug: true, title: true, description: true },
                })
              : Promise.resolve([]),
          ]);

          return Response.json({
            people: people.map((u) => resolveUser(u)),
            posts: posts.map((p) => ({
              id: p.id,
              content: p.content,
              createdAt: p.createdAt.toISOString(),
              likeCount: p.likeCount,
              user: resolveUser(p.user),
            })),
            builds,
            blog,
          });
        } catch (error) {
          console.error('Search error:', error);
          return Response.json({ error: 'Internal Server Error' }, { status: 500 });
        }
      },
    },
  },
});
