import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { listNotifications } from '@/lib/notifications.server';

/**
 * GET /api/notifications — the current user's notifications, newest first.
 * Cursor pagination via ?cursor=<id>&limit=<n>. Returns { items, nextCursor }.
 */
export const Route = createFileRoute('/api/notifications/')({
  server: {
    handlers: {
      GET: defineHandler({}, async ({ request, session }) => {
        const url = new URL(request.url);
        const cursor = url.searchParams.get('cursor');
        const limit = Number(url.searchParams.get('limit')) || 20;
        const result = await listNotifications(session.user.id, { cursor, limit });
        return Response.json(result);
      }),
    },
  },
});
