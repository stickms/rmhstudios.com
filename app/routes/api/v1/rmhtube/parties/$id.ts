import { createFileRoute } from '@tanstack/react-router';
import { withDeveloperApi, apiOptions } from '@/lib/api/with-developer-api.server';
import { getPartyForKey } from '@/lib/api/v1/rmhtube.server';

/** GET /api/v1/rmhtube/parties/{id} — one party the key owner can see (public, hosted or answered by them). */
export const Route = createFileRoute('/api/v1/rmhtube/parties/$id')({
  server: {
    handlers: {
      OPTIONS: () => apiOptions(),

      GET: ({ request, params }) =>
        withDeveloperApi(
          request,
          async ({ userId, json, error }) => {
            const party = await getPartyForKey(params.id ?? '', userId);
            return party ? json(party) : error('not_found', 'Party not found.', 404);
          },
          { scope: 'read:rmhtube' },
        ),
    },
  },
});
