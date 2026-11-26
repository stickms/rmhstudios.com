import { createFileRoute } from '@tanstack/react-router';
import { withDeveloperApi, apiOptions } from '@/lib/api/with-developer-api.server';
import { NO_STORE, unreadCountForKey } from '@/lib/api/v1/notifications.server';

/** GET /api/v1/me/notifications/unread-count — `{ count }`, the number on the site's badge. Never cached. */
export const Route = createFileRoute('/api/v1/me/notifications/unread-count')({
  server: {
    handlers: {
      OPTIONS: () => apiOptions(),

      GET: ({ request }) =>
        withDeveloperApi(request, async ({ userId, json }) => json(await unreadCountForKey(userId), 200, NO_STORE), {
          scope: 'read:notifications',
        }),
    },
  },
});
