import { createFileRoute } from '@tanstack/react-router';
import { prisma } from '@/lib/prisma.server';
import { withDeveloperApi, apiOptions } from '@/lib/api/with-developer-api.server';
import { apiAuthorSelect, parsePage, page, serializePublicPost } from '@/lib/api/serializers.server';

/** GET /api/v1/users/{handle}/posts — a user's public posts, newest first. */
export const Route = createFileRoute('/api/v1/users/$handle/posts')({
  server: {
    handlers: {
      OPTIONS: () => apiOptions(),

      GET: ({ request, params }) =>
        withDeveloperApi(
          request,
          async ({ json, error }) => {
            const handle = params.handle.replace(/^@/, '');
            const user = await prisma.user.findUnique({ where: { handle }, select: { id: true } });
            if (!user) return error('not_found', 'User not found.', 404);

            const { limit, cursor } = parsePage(new URL(request.url));
            const posts = await prisma.rMHark.findMany({
              where: { userId: user.id, deletedAt: null, audience: 'PUBLIC', communityId: null, ...(cursor ? { createdAt: { lt: new Date(cursor) } } : {}) },
              orderBy: { createdAt: 'desc' },
              take: limit,
              select: {
                id: true, content: true, createdAt: true, likeCount: true, commentCount: true,
                repostCount: true, viewCount: true, imageUrls: true, user: { select: apiAuthorSelect },
              },
            });
            return json(page(posts.map(serializePublicPost), limit, (p) => p.createdAt.toISOString()));
          },
          { scope: 'read:users' }
        ),
    },
  },
});
