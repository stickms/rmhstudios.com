import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { listNotifications } from '@/lib/notifications.server';
import { typesFor } from '@/lib/notifications/filters';
import { listQuery, splitUnreadIds } from '@/lib/notifications/inbox-schema';
import { listNotificationsApi } from '@/lib/preferences/preferences.contract';

/**
 * GET /api/notifications — the current user's notifications, newest first.
 * Cursor pagination via ?cursor=<id>&limit=<n>. Returns { items, nextCursor }.
 * ?filter=<id> limits it to a filter's types (lib/notifications/filters.ts); ?unread=true limits it to unread rows,
 * plus the comma-separated ?unreadIds= (at most 100: what was unread when the inbox opened).
 */
export const route = apiRoute('/api/notifications', {
  GET: implement(
    listNotificationsApi,
    { query: listQuery },
    async ({ session, query }) => {
      const result = await listNotifications(session.user.id, {
        cursor: query.cursor ?? null,
        limit: query.limit ?? 20,
        types: typesFor(query.filter),
        ...(query.unread ? { unread: { alsoIds: splitUnreadIds(query.unreadIds) } } : {}),
      });
      return Response.json(result);
    },
  ),
});
