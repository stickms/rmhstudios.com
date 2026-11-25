import { createFileRoute } from '@tanstack/react-router';
import { withDeveloperApi, apiOptions } from '@/lib/api/with-developer-api.server';
import { NO_STORE, listSearchesForKey } from '@/lib/api/v1/homes.server';

/**
 * GET /api/v1/me/homes/searches — your saved searches (alerts), newest first. Needs the explicit `read:homes` scope.
 * A search's centre (`lat`, `lng`) is never returned: it is often the member's own street, and the label names it.
 */
export const Route = createFileRoute('/api/v1/me/homes/searches')({
  server: {
    handlers: {
      OPTIONS: () => apiOptions(),

      GET: ({ request }) =>
        withDeveloperApi(
          request,
          async ({ userId, json }) => json({ data: await listSearchesForKey(userId) }, 200, NO_STORE),
          { scope: 'read:homes' },
        ),
    },
  },
});
