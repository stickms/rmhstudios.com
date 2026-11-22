import { createFileRoute } from '@tanstack/react-router';
import { withDeveloperApi, apiOptions } from '@/lib/api/with-developer-api.server';
import { matchPath } from '@/lib/api/v1/tournaments-schema';
import { readInput, withdrawForKey } from '@/lib/api/v1/tournaments.server';

/** POST /api/v1/tournaments/{id}/matches/{matchId}/claim/withdraw — take your own report back before it is answered. */
export const Route = createFileRoute('/api/v1/tournaments/$id/matches/$matchId/claim/withdraw')({
  server: {
    handlers: {
      OPTIONS: () => apiOptions(),

      POST: ({ request, params }) =>
        withDeveloperApi(
          request,
          async ({ userId, json, error }) => {
            const p = readInput(params, matchPath);
            if (!p.ok) return error('invalid_request', p.message, 400);
            const out = await withdrawForKey(p.data.id, p.data.matchId, userId);
            if (!out.ok) return error(out.code, out.message, out.status);
            return json(out.result);
          },
          {
            scope: 'write:tournaments',
            idempotent: true,
          },
        ),
    },
  },
});
