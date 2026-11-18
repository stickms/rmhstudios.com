import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { CACHE_POLICY } from '@/lib/api/cache-policies';
import { vibePageApi } from '@/lib/rmhvibe/vibe-page.contract';
import { vibePageQuerySchema } from '@/lib/rmhvibe/vibe-schema';
import { getVibeRunnable } from '@/lib/rmhvibe/vibe-embed.server';

/** GET /api/vibe/page/:slug — a ready page's runnable document (a feed card's Run). Public, like /v/:slug. */
export const route =
  apiRoute(
    '/api/vibe/page/$slug',
    {
      GET: implement(
        vibePageApi,
        {
          auth: 'none',
          rateLimit:
            'read',
          query:
            vibePageQuerySchema,
          microCache: false,
          cache:
            CACHE_POLICY.liveList,
        },
        async ({
          params,
          query,
        }) => {
          const page =
            await getVibeRunnable(
              params.slug,
              query.versionId,
            );
          if (
            !page
          )
            return Response.json(
              {
                error:
                  'Not found',
              },
              {
                status: 404,
              },
            );
          return page;
        },
      ),
    },
  );
