import { createFileRoute } from '@tanstack/react-router';
import { prisma } from '@/lib/prisma.server';
import { withDeveloperApi, apiOptions } from '@/lib/api/with-developer-api.server';
import { apiAuthorSelect, serializePublicPost, parsePage } from '@/lib/api/serializers.server';

/** GET /api/v1/me/bookmarks — posts you have bookmarked, newest first. */
export const Route = createFileRoute('/api/v1/me/bookmarks')({
  server: {
    handlers: {
      OPTIONS: () => apiOptions(),

      GET: ({ request }) =>
        withDeveloperApi(
          request,
          async ({ userId, json }) => {
            const { limit, cursor } = parsePage(new URL(request.url));
            const rows = await prisma.rMHarkBookmark.findMany({
              where: { userId, ...(cursor ? { createdAt: { lt: new Date(cursor) } } : {}) },
              orderBy: { createdAt: 'desc' },
              take: limit,
              select: {
                createdAt: true,
                rmhark: {
                  select: {
                    id: true, content: true, createdAt: true, deletedAt: true, likeCount: true, commentCount: true,
                    repostCount: true, viewCount: true, imageUrls: true, user: { select: apiAuthorSelect },
                  },
                },
              },
            });
            const data = rows
              .filter((b) => b.rmhark && !b.rmhark.deletedAt)
              .map((b) => ({ ...serializePublicPost(b.rmhark!), bookmarkedAt: b.createdAt }));
            const nextCursor = rows.length === limit ? rows[rows.length - 1].createdAt.toISOString() : null;
            return json({ data, nextCursor });
          },
          { scope: 'read:bookmarks' }
        ),
    },
  },
});
