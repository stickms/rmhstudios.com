import { createFileRoute } from '@tanstack/react-router';
import { prisma } from '@/lib/prisma.server';
import { withDeveloperApi, apiJson, apiOptions } from '@/lib/api/with-developer-api.server';
import { userDisplaySelect, resolveUser } from '@/lib/user-display';

/**
 * GET /api/v1/feed — the public global feed (keyset by ?cursor=<ISO createdAt>).
 * Only public, free, non-community posts are returned, so nothing private or
 * paid leaks through the API.
 */
export const Route = createFileRoute('/api/v1/feed')({
  server: {
    handlers: {
      OPTIONS: () => apiOptions(),

      GET: ({ request }) =>
        withDeveloperApi(request, async () => {
          const url = new URL(request.url);
          const cursor = url.searchParams.get('cursor');
          const limit = Math.min(parseInt(url.searchParams.get('limit') || '20', 10) || 20, 50);

          const posts = await prisma.rMHark.findMany({
            where: {
              deletedAt: null,
              audience: 'PUBLIC',
              unlockPrice: null,
              communityId: null,
              ...(cursor ? { createdAt: { lt: new Date(cursor) } } : {}),
            },
            orderBy: { createdAt: 'desc' },
            take: limit,
            select: {
              id: true, content: true, createdAt: true, likeCount: true, commentCount: true,
              repostCount: true, viewCount: true, user: { select: userDisplaySelect },
            },
          });

          const nextCursor = posts.length === limit ? posts[posts.length - 1].createdAt.toISOString() : null;
          return apiJson({
            data: posts.map((p) => {
              const u = resolveUser(p.user);
              return {
                id: p.id,
                content: p.content,
                createdAt: p.createdAt,
                author: { id: u.id, name: u.name, handle: u.handle, image: u.image },
                metrics: { likes: p.likeCount, comments: p.commentCount, reposts: p.repostCount, views: p.viewCount },
              };
            }),
            nextCursor,
          });
        }),
    },
  },
});
