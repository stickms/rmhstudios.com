import { pageSize } from '@/lib/pagination';
import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { listNotifications } from '@/lib/notifications.server';
import { listNotificationsApi } from '@/lib/preferences/preferences.contract';

/**
 * GET /api/notifications — the current user's notifications, newest first.
 * Cursor pagination via ?cursor=<id>&limit=<n>. Returns { items, nextCursor }.
 */
export const route = apiRoute('/api/notifications', {
  GET: implement(listNotificationsApi, {}, async ({ request, session }) => {
    const url = new URL(request.url);
    const cursor = url.searchParams.get('cursor');
    const limit = pageSize(url.searchParams.get('limit'), 20, 50);
    const result = await listNotifications(session.user.id, { cursor, limit });
    return Response.json(result);
  }),
});
