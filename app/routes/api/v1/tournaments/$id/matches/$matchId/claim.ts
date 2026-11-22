import { createFileRoute } from '@tanstack/react-router';
import { withDeveloperApi, apiOptions } from '@/lib/api/with-developer-api.server';
import { claimBody, matchPath } from '@/lib/api/v1/tournaments-schema';
import { claimForKey, readBody, readInput } from '@/lib/api/v1/tournaments.server';

/** POST /api/v1/tournaments/{id}/matches/{matchId}/claim — report who won (the site's claim). */
export const Route = createFileRoute('/api/v1/tournaments/$id/matches/$matchId/claim')({
  server: {
    handlers: {
      OPTIONS: () => apiOptions(),

      POST: ({ request, params }) =>
        withDeveloperApi(
          request,
          async ({ userId, json, error }) => {
            const p = readInput(params, matchPath);
            if (!p.ok) return error('invalid_request', p.message, 400);
            const body = await readBody(request, claimBody);
            if (!body.ok) return error('invalid_request', body.message, 400);
            const out = await claimForKey(p.data.id, p.data.matchId, userId, body.data);
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
