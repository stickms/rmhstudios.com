import { createFileRoute } from '@tanstack/react-router';
import { prisma } from '@/lib/prisma.server';
import { viewerVisiblePostWhere } from '@/lib/feed/audience.server';
import { isLocked } from '@/lib/feed/map-feed-item.server';
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
              // A bookmark is not a standing right to read (private now, deleted, blocked author,
              // private community): same visibility rule as the web bookmarks list.
              where: { id: { in: rows.map((r) => r.entityId) }, ...(await viewerVisiblePostWhere(userId)) },
              select: {
                id: true, userId: true, content: true, createdAt: true, deletedAt: true, likeCount: true,
                commentCount: true, repostCount: true, viewCount: true, imageUrls: true,
                unlockPrice: true, unlocks: { where: { userId }, select: { id: true } },
                user: { select: apiAuthorSelect },
              },
            });
            // Audience access is not paid access: a priced post the caller has not unlocked is
            // left out, as GET /api/v1/posts/{id} refuses it (bookmarking does not unlock).
            const byId = new Map(posts.filter((p) => !isLocked(p, userId)).map((p) => [p.id, p]));
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
