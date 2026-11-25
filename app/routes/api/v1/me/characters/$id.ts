import { createFileRoute } from '@tanstack/react-router';
import { withDeveloperApi, apiOptions } from '@/lib/api/with-developer-api.server';
import { characterPath } from '@/lib/api/v1/characters-schema';
import { getCharacterForKey, NO_STORE, readInput } from '@/lib/api/v1/characters.server';

/** GET /api/v1/me/characters/{id} — one of your characters with its stored sheet (the portrait image is left out). */
export const Route = createFileRoute('/api/v1/me/characters/$id')({
  server: {
    handlers: {
      OPTIONS: () => apiOptions(),

      GET: ({ request, params }) =>
        withDeveloperApi(
          request,
          async ({ userId, json, error }) => {
            const p = readInput(params, characterPath);
            if (!p.ok) return error('invalid_request', p.message, 400, NO_STORE);
            const c = await getCharacterForKey(userId, p.data.id);
            if (!c) return error('not_found', 'Not found.', 404, NO_STORE);
            return json({ data: c }, 200, NO_STORE);
          },
          { scope: 'read:characters' },
        ),
    },
  },
});
