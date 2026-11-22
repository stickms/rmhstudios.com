import { createFileRoute } from '@tanstack/react-router';
import { withDeveloperApi, apiOptions } from '@/lib/api/with-developer-api.server';
import { matchesQuery, tournamentPath } from '@/lib/api/v1/tournaments-schema';
import { listMatchesForKey, queryOf, readInput } from '@/lib/api/v1/tournaments.server';

/** GET /api/v1/tournaments/{id}/matches — the bracket by round and slot, with the open claim's state. */
export const Route = createFileRoute('/api/v1/tournaments/$id/matches')({
  server: {
    handlers: {
      OPTIONS: () => apiOptions(),

      GET: ({ request, params }) =>
        withDeveloperApi(
          request,
          async ({ userId, json, error }) => {
            const p = readInput(params, tournamentPath);
            if (!p.ok) return error('invalid_request', p.message, 400);
            const q = readInput(queryOf(request), matchesQuery);
            if (!q.ok) return error('invalid_request', q.message, 400);
            const page = await listMatchesForKey(p.data.id, userId, q.data);
            if (page === 'invalid_cursor') return error('invalid_request', 'Invalid cursor.', 400);
            if (!page) return error('not_found', 'Not found.', 404);
            return json(page);
          },
          {
            scope: 'read:tournaments',
          },
        ),
    },
  },
});
