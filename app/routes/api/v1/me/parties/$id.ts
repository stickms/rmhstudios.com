import { createFileRoute } from '@tanstack/react-router';
import { withDeveloperApi, apiOptions } from '@/lib/api/with-developer-api.server';
import { partyPath } from '@/lib/api/v1/characters-schema';
import { getPartyForKey, NO_STORE, readInput } from '@/lib/api/v1/characters.server';

/** GET /api/v1/me/parties/{id} — one of your parties as the site shows it: summaries and the turn order, no sheets. */
export const Route = createFileRoute('/api/v1/me/parties/$id')({
  server: {
    handlers: {
      OPTIONS: () => apiOptions(),

      GET: ({ request, params }) =>
        withDeveloperApi(
          request,
          async ({ userId, json, error }) => {
            const p = readInput(params, partyPath);
            if (!p.ok) return error('invalid_request', p.message, 400, NO_STORE);
            const party = await getPartyForKey(userId, p.data.id);
            if (!party) return error('not_found', 'Not found.', 404, NO_STORE);
            return json({ data: party }, 200, NO_STORE);
          },
          { scope: 'read:characters' },
        ),
    },
  },
});
