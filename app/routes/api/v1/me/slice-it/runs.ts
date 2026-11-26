import { createFileRoute } from '@tanstack/react-router';
import { withDeveloperApi, apiOptions } from '@/lib/api/with-developer-api.server';
import { runsQuery } from '@/lib/api/v1/slice-it-schema';
import { NO_STORE, listRunsForKey, queryOf, readInput } from '@/lib/api/v1/slice-it.server';

/**
 * GET /api/v1/me/slice-it/runs — your own Slice It! runs, newest first (`?limit&cursor&songId`). Needs the explicit
 * `read:slice-it-runs` scope. Never carries another member's runs. Never cached.
 */
export const Route = createFileRoute('/api/v1/me/slice-it/runs')({
  server: {
    handlers: {
      OPTIONS: () => apiOptions(),

      GET: ({ request }) =>
        withDeveloperApi(
          request,
          async ({ userId, json, error }) => {
            const q = readInput(queryOf(request), runsQuery);
            if (!q.ok) return error('invalid_request', q.message, 400, NO_STORE);
            const page = await listRunsForKey(userId, q.data);
            if (page === 'invalid_cursor') return error('invalid_request', 'Invalid cursor.', 400, NO_STORE);
            return json(page, 200, NO_STORE);
          },
          { scope: 'read:slice-it-runs' },
        ),
    },
  },
});
