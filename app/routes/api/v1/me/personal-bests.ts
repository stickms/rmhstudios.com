import { createFileRoute } from '@tanstack/react-router';
import {
  withDeveloperApi,
  apiOptions,
} from '@/lib/api/with-developer-api.server';
import { parsePage } from '@/lib/api/serializers.server';
import {
  parsePersonalBestCursor,
  personalBestsQuerySchema,
} from '@/lib/api/personal-bests-serializers';
import { loadPersonalBests } from '@/lib/api/personal-bests-data.server';
import { isTrackableTitle } from '@/lib/games/route-match';

/**
 * GET /api/v1/me/personal-bests — the key owner's current personal best in each
 * game, ordered by game id. Only the key owner's rows are ever read.
 */
export const Route =
  createFileRoute(
    '/api/v1/me/personal-bests',
  )(
    {
      server:
        {
          handlers:
            {
              OPTIONS:
                () =>
                  apiOptions(),

              GET: ({
                request,
              }) =>
                withDeveloperApi(
                  request,
                  async ({
                    userId,
                    json,
                    error,
                  }) => {
                    const url =
                      new URL(
                        request.url,
                      );
                    const {
                      limit,
                      cursor:
                        rawCursor,
                    } =
                      parsePage(
                        url,
                        {
                          maxLimit: 100,
                        },
                      );
                    const query =
                      personalBestsQuerySchema.safeParse(
                        {
                          gameId:
                            url.searchParams.get(
                              'gameId',
                            ) ??
                            undefined,
                          since:
                            url.searchParams.get(
                              'since',
                            ) ??
                            undefined,
                        },
                      );
                    if (
                      !query.success
                    )
                      return error(
                        'invalid_request',
                        'Invalid `gameId` or `since`.',
                        400,
                      );
                    const {
                      gameId,
                      since,
                    } =
                      query.data;
                    if (
                      gameId &&
                      !isTrackableTitle(
                        gameId,
                      )
                    )
                      return error(
                        'invalid_request',
                        'Unknown game.',
                        400,
                      );
                    const cursor =
                      parsePersonalBestCursor(
                        rawCursor,
                      );
                    if (
                      rawCursor &&
                      !cursor
                    )
                      return error(
                        'invalid_request',
                        'Invalid cursor.',
                        400,
                      );
                    return json(
                      await loadPersonalBests(
                        userId,
                        {
                          gameId,
                          since,
                          cursor,
                          limit,
                        },
                      ),
                    );
                  },
                  {
                    scope:
                      'read:games',
                  },
                ),
            },
        },
    },
  );
