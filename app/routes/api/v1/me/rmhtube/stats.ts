import { createFileRoute } from '@tanstack/react-router';
import { withDeveloperApi, apiOptions } from '@/lib/api/with-developer-api.server';
import { statsForKey } from '@/lib/api/v1/rmhtube.server';

/** GET /api/v1/me/rmhtube/stats — your own watch statistics, as the site shows them. Pausing and clearing stay on the site. */
export const Route = createFileRoute('/api/v1/me/rmhtube/stats')({
  server: {
    handlers: {
      OPTIONS: () => apiOptions(),

      GET: ({ request }) =>
        withDeveloperApi(request, async ({ userId, json }) => json(await statsForKey(userId)), {
          scope: 'read:rmhtube',
        }),
    },
  },
});
