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
            // Bookmarks are saves with entityType 'rmhark' (migration
            // 20260803210000). `saved_item` is polymorphic, so the posts come
            // from a second query keyed by id rather than a relation include.
            const rows = await prisma.savedItem.findMany({
              where: {
                userId,
                entityType: 'rmhark',
                ...(cursor ? { createdAt: { lt: new Date(cursor) } } : {}),
              },
              orderBy: { createdAt: 'desc' },
              take: limit,
              select: { createdAt: true, entityId: true },
            });
            const posts = await prisma.rMHark.findMany({
              where: { id: { in: rows.map((r) => r.entityId) }, deletedAt: null },
              select: {
                id: true, content: true, createdAt: true, deletedAt: true, likeCount: true, commentCount: true,
                repostCount: true, viewCount: true, imageUrls: true, user: { select: apiAuthorSelect },
              },
            });
            const byId = new Map(posts.map((p) => [p.id, p]));
            const data = rows
              .filter((r) => byId.has(r.entityId))
              .map((r) => ({ ...serializePublicPost(byId.get(r.entityId)!), bookmarkedAt: r.createdAt }));
            const nextCursor = rows.length === limit ? rows[rows.length - 1].createdAt.toISOString() : null;
            return json({ data, nextCursor });
          },
          { scope: 'read:bookmarks' }
        ),
    },
  },
});
