import { createFileRoute } from '@tanstack/react-router';
import { withDeveloperApi, apiOptions } from '@/lib/api/with-developer-api.server';
import { myTournamentsQuery } from '@/lib/api/v1/tournaments-schema';
import { listMyTournamentsForKey, queryOf, readInput } from '@/lib/api/v1/tournaments.server';

/** GET /api/v1/me/tournaments — the tournaments you entered, each with the match you are due to play. */
export const Route = createFileRoute('/api/v1/me/tournaments')({
  server: {
    handlers: {
      OPTIONS: () => apiOptions(),

      GET: ({ request }) =>
        withDeveloperApi(
          request,
          async ({ userId, json, error }) => {
            const q = readInput(queryOf(request), myTournamentsQuery);
            if (!q.ok) return error('invalid_request', q.message, 400);
            const page = await listMyTournamentsForKey(userId, q.data);
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
