import { createFileRoute } from '@tanstack/react-router';
import { withDeveloperApi, apiOptions } from '@/lib/api/with-developer-api.server';
import { tournamentPath } from '@/lib/api/v1/tournaments-schema';
import { checkInForKey, readInput } from '@/lib/api/v1/tournaments.server';

/** POST /api/v1/tournaments/{id}/check-in — check the key owner in (the site's check-in). */
export const Route = createFileRoute('/api/v1/tournaments/$id/check-in')({
  server: {
    handlers: {
      OPTIONS: () => apiOptions(),

      POST: ({ request, params }) =>
        withDeveloperApi(
          request,
          async ({ userId, json, error }) => {
            const p = readInput(params, tournamentPath);
            if (!p.ok) return error('invalid_request', p.message, 400);
            const out = await checkInForKey(p.data.id, userId);
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
