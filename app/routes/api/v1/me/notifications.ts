import { createFileRoute } from '@tanstack/react-router';
import { withDeveloperApi, apiOptions } from '@/lib/api/with-developer-api.server';
import { listQuery } from '@/lib/api/v1/notifications-schema';
import { NO_STORE, listNotificationsForKey, queryOf, readInput } from '@/lib/api/v1/notifications.server';

/**
 * GET /api/v1/me/notifications — your notifications, newest first (`?limit&cursor&unread`). Each carries the site
 * notice's `key` and `params` (both `null` for a plain notification). The cursor is `<createdAt>|<id>`; the old bare
 * time is still read. Never cached.
 */
export const Route = createFileRoute('/api/v1/me/notifications')({
  server: {
    handlers: {
      OPTIONS: () => apiOptions(),

      GET: ({ request }) =>
        withDeveloperApi(
          request,
          async ({ userId, json, error }) => {
            const q = readInput(queryOf(request), listQuery);
            if (!q.ok) return error('invalid_request', q.message, 400, NO_STORE);
            const page = await listNotificationsForKey(userId, q.data);
            if (page === 'invalid_cursor') return error('invalid_request', 'Invalid cursor.', 400, NO_STORE);
            return json(page, 200, NO_STORE);
          },
          { scope: 'read:notifications' },
        ),
    },
  },
});
