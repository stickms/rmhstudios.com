import { createFileRoute } from '@tanstack/react-router';
import { withDeveloperApi, apiOptions } from '@/lib/api/with-developer-api.server';
import { tournamentPath } from '@/lib/api/v1/tournaments-schema';
import { getTournamentForKey, readInput } from '@/lib/api/v1/tournaments.server';

/** GET /api/v1/tournaments/{id} — one tournament, as its site page shows it. */
export const Route = createFileRoute('/api/v1/tournaments/$id')({
  server: {
    handlers: {
      OPTIONS: () => apiOptions(),

      GET: ({ request, params }) =>
        withDeveloperApi(
          request,
          async ({ userId, json, error }) => {
            const p = readInput(params, tournamentPath);
            if (!p.ok) return error('invalid_request', p.message, 400);
            const t = await getTournamentForKey(p.data.id, userId);
            if (!t) return error('not_found', 'Not found.', 404);
            return json(t);
          },
          {
            scope: 'read:tournaments',
          },
        ),
    },
  },
});
