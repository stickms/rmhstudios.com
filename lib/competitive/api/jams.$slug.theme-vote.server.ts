import { apiRoute } from '@/lib/api/route.server';
import { notFound } from '@/lib/api/handler.server';
import { implement } from '@/lib/api/implement.server';
import {
  castJamThemeVotesApi,
  getJamThemeVoteApi,
} from '@/lib/competitive/jam-themes.contract';
import { castVotesSchema } from '@/lib/competitive/jam-themes-schema';
import {
  castVotes,
  themeVoteView,
} from '@/lib/competitive/jam-themes.server';

/**
 * GET /api/jams/$slug/theme-vote — the shortlist and the viewer's marks; counts and the winner only after the start.
 * PUT /api/jams/$slug/theme-vote — set the viewer's marks (up to three) while voting is open.
 */
export const route =
  apiRoute(
    '/api/jams/$slug/theme-vote',
    {
      GET: implement(
        getJamThemeVoteApi,
        {
          auth: 'optional',
          rateLimit:
            'read',
        },
        async ({
          params,
          userId,
        }) => {
          const view =
            await themeVoteView(
              params.slug,
              userId,
            );
          if (
            !view
          )
            return notFound(
              'Jam not found',
            );
          return Response.json(
            {
              view,
            },
            {
              headers:
                {
                  'Cache-Control':
                    'private, no-store',
                },
            },
          );
        },
      ),
      PUT: implement(
        castJamThemeVotesApi,
        {
          rateLimit:
            'write',
          body: castVotesSchema,
        },
        async ({
          params,
          userId,
          body,
        }) => {
          const res =
            await castVotes(
              params.slug,
              userId,
              body.candidateIds,
            );
          if (
            !res.ok
          )
            return Response.json(
              {
                error:
                  res.error,
              },
              {
                status:
                  res.status,
              },
            );
          return Response.json(
            {
              ok: true as const,
              mine: res.mine,
            },
          );
        },
      ),
    },
  );
