import { createFileRoute } from '@tanstack/react-router';
import { withDeveloperApi, apiOptions } from '@/lib/api/with-developer-api.server';
import { loadPlaytime } from '@/lib/api/games-data.server';

/** GET /api/v1/me/games — the key owner's played titles and minutes. */
export const Route = createFileRoute('/api/v1/me/games')({
  server: {
    handlers: {
      OPTIONS: () => apiOptions(),

      GET: ({ request }) =>
        withDeveloperApi(
          request,
          async ({ userId, json }) =>
            json({
              data: await loadPlaytime(userId),
            }),
          {
            scope: 'read:games',
          },
        ),
    },
  },
});
