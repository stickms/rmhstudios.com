import { createFileRoute } from '@tanstack/react-router';
import { withDeveloperApi, apiOptions } from '@/lib/api/with-developer-api.server';
import { listPartiesForKey } from '@/lib/api/v1/rmhtube.server';

/** GET /api/v1/rmhtube/parties — the upcoming watch parties the key owner can see, as the site lists them. */
export const Route = createFileRoute('/api/v1/rmhtube/parties')({
  server: {
    handlers: {
      OPTIONS: () => apiOptions(),

      GET: ({ request }) =>
        withDeveloperApi(request, async ({ userId, json }) => json({ data: await listPartiesForKey(userId) }), {
          scope: 'read:rmhtube',
        }),
    },
  },
});
