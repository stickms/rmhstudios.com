import { createFileRoute } from '@tanstack/react-router';
import { withDeveloperApi, apiOptions } from '@/lib/api/with-developer-api.server';
import { listCatalogGames } from '@/lib/api/games-serializers.server';

/**
 * GET /api/v1/games — the game catalogue: listed titles that live on this site.
 * Public data, so any valid key may read it; no scope is required.
 */
export const Route = createFileRoute('/api/v1/games')({
  server: {
    handlers: {
      OPTIONS: () => apiOptions(),

      GET: ({ request }) =>
        withDeveloperApi(request, async ({ json }) =>
          json(
            {
              data: listCatalogGames(),
            },
            200,
            {
              'Cache-Control': 'public, max-age=300',
            },
          ),
        ),
    },
  },
});
