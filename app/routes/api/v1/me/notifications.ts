import { createFileRoute } from '@tanstack/react-router';
import { prisma } from '@/lib/prisma.server';
import { withDeveloperApi, apiOptions } from '@/lib/api/with-developer-api.server';
import { apiAuthorSelect, serializeAuthor, parsePage } from '@/lib/api/serializers.server';

/** GET /api/v1/me/notifications — your notifications, newest first. */
export const Route = createFileRoute('/api/v1/me/notifications')({
  server: {
    handlers: {
      OPTIONS: () => apiOptions(),

      GET: ({ request }) =>
        withDeveloperApi(
          request,
          async ({ userId, json }) => {
            const { limit, cursor } = parsePage(new URL(request.url));
            const rows = await prisma.notification.findMany({
              where: { userId, ...(cursor ? { createdAt: { lt: new Date(cursor) } } : {}) },
              orderBy: { createdAt: 'desc' },
              take: limit,
              select: { id: true, type: true, entityType: true, entityId: true, preview: true, link: true, read: true, createdAt: true, actor: { select: apiAuthorSelect } },
            });
            const data = rows.map((n) => ({
              id: n.id,
              type: n.type,
              entityType: n.entityType,
              entityId: n.entityId,
              preview: n.preview,
              link: n.link,
              read: n.read,
              createdAt: n.createdAt,
              actor: n.actor ? serializeAuthor(n.actor) : null,
            }));
            const nextCursor = rows.length === limit ? rows[rows.length - 1].createdAt.toISOString() : null;
            return json({ data, nextCursor });
          },
          { scope: 'read:notifications' }
        ),
    },
  },
});
