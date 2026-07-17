import { createFileRoute } from '@tanstack/react-router';
import { prisma } from '@/lib/prisma.server';
import { withDeveloperApi, apiOptions } from '@/lib/api/with-developer-api.server';
import { apiAuthorSelect, parsePage, page, serializePublicPost } from '@/lib/api/serializers.server';

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
        withDeveloperApi(
          request,
          async ({ json }) => {
            const { limit, cursor } = parsePage(new URL(request.url));
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
                repostCount: true, viewCount: true, imageUrls: true, user: { select: apiAuthorSelect },
              },
            });
            return json(page(posts.map(serializePublicPost), limit, (p) => p.createdAt.toISOString()));
          },
          // Feed assembly is heavier than a single-row read; weight it modestly.
          { scope: 'read:feed', cost: 2 }
        ),
    },
  },
});
