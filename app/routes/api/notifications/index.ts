import { createFileRoute } from '@tanstack/react-router';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma.server';
import { userDisplaySelect, resolveUser } from '@/lib/user-display';

/**
 * GET /api/notifications — the current user's notifications, newest first.
 * Cursor pagination via ?cursor=<id>&limit=<n>. Returns { items, nextCursor }.
 */
export const Route = createFileRoute('/api/notifications/')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const session = await auth.api.getSession({ headers: request.headers });
          if (!session) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
          }

          const url = new URL(request.url);
          const cursor = url.searchParams.get('cursor');
          const limit = Math.min(Math.max(Number(url.searchParams.get('limit')) || 20, 1), 50);

          const rows = await prisma.notification.findMany({
            where: { userId: session.user.id },
            orderBy: { createdAt: 'desc' },
            take: limit + 1,
            ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
            include: { actor: { select: userDisplaySelect } },
          });

          const hasMore = rows.length > limit;
          const items = (hasMore ? rows.slice(0, limit) : rows).map((n) => ({
            id: n.id,
            type: n.type,
            entityType: n.entityType,
            entityId: n.entityId,
            preview: n.preview,
            link: n.link,
            read: n.read,
            createdAt: n.createdAt.toISOString(),
            actor: n.actor ? resolveUser(n.actor) : null,
          }));

          return Response.json({
            items,
            nextCursor: hasMore ? items[items.length - 1]?.id ?? null : null,
          });
        } catch (error) {
          console.error('List notifications error:', error);
          return Response.json({ error: 'Internal Server Error' }, { status: 500 });
        }
      },
    },
  },
});
