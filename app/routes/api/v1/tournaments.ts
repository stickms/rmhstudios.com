import { createFileRoute } from '@tanstack/react-router';
import { withDeveloperApi, apiOptions } from '@/lib/api/with-developer-api.server';
import { listQuery } from '@/lib/api/v1/tournaments-schema';
import { listTournamentsForKey, queryOf, readInput } from '@/lib/api/v1/tournaments.server';

/** GET /api/v1/tournaments — public tournaments, newest first; filter by `status` and `game`. */
export const Route = createFileRoute('/api/v1/tournaments')({
  server: {
    handlers: {
      OPTIONS: () => apiOptions(),

      GET: ({ request }) =>
        withDeveloperApi(
          request,
          async ({ json, error }) => {
            const q = readInput(queryOf(request), listQuery);
            if (!q.ok) return error('invalid_request', q.message, 400);
            const page = await listTournamentsForKey(q.data);
            if (page === 'invalid_cursor') return error('invalid_request', 'Invalid cursor.', 400);
            return json(page);
          },
          {
            scope: 'read:tournaments',
          },
        ),
    },
  },
});
