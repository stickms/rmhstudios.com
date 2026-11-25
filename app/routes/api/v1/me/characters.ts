import { createFileRoute } from '@tanstack/react-router';
import { withDeveloperApi, apiOptions } from '@/lib/api/with-developer-api.server';
import { charactersQuery } from '@/lib/api/v1/characters-schema';
import { listCharactersForKey, NO_STORE, queryOf, readInput } from '@/lib/api/v1/characters.server';

/** GET /api/v1/me/characters — your RMHCharacters sheets, each with the summary a party sees. */
export const Route = createFileRoute('/api/v1/me/characters')({
  server: {
    handlers: {
      OPTIONS: () => apiOptions(),

      GET: ({ request }) =>
        withDeveloperApi(
          request,
          async ({ userId, json, error }) => {
            const q = readInput(queryOf(request), charactersQuery);
            if (!q.ok) return error('invalid_request', q.message, 400, NO_STORE);
            const page = await listCharactersForKey(userId, q.data);
            if (page === 'invalid_cursor') return error('invalid_request', 'Invalid cursor.', 400, NO_STORE);
            return json(page, 200, NO_STORE);
          },
          { scope: 'read:characters' },
        ),
    },
  },
});
