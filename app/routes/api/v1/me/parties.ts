import { createFileRoute } from '@tanstack/react-router';
import { withDeveloperApi, apiOptions } from '@/lib/api/with-developer-api.server';
import { listPartiesForKey, NO_STORE } from '@/lib/api/v1/characters.server';

/** GET /api/v1/me/parties — the RMHCharacters parties you run or play in. */
export const Route = createFileRoute('/api/v1/me/parties')({
  server: {
    handlers: {
      OPTIONS: () => apiOptions(),

      GET: ({ request }) =>
        withDeveloperApi(request, async ({ userId, json }) => json(await listPartiesForKey(userId), 200, NO_STORE), {
          scope: 'read:characters',
        }),
    },
  },
});
