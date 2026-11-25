import { createFileRoute } from '@tanstack/react-router';
import { withDeveloperApi, apiOptions } from '@/lib/api/with-developer-api.server';
import { savedQuery } from '@/lib/api/v1/homes-schema';
import { NO_STORE, listSavedForKey, queryOf, readInput } from '@/lib/api/v1/homes.server';

/**
 * GET /api/v1/me/homes/saved — your saved homes, newest saved first, each with your note, the price alert and the
 * newest price changes. Needs the explicit `read:homes` scope. Never carries an address or coordinates.
 */
export const Route = createFileRoute('/api/v1/me/homes/saved')({
  server: {
    handlers: {
      OPTIONS: () => apiOptions(),

      GET: ({ request }) =>
        withDeveloperApi(
          request,
          async ({ userId, json, error }) => {
            const q = readInput(queryOf(request), savedQuery);
            if (!q.ok) return error('invalid_request', q.message, 400, NO_STORE);
            const page = await listSavedForKey(userId, q.data);
            if (page === 'invalid_cursor') return error('invalid_request', 'Invalid cursor.', 400, NO_STORE);
            return json(page, 200, NO_STORE);
          },
          { scope: 'read:homes' },
        ),
    },
  },
});
