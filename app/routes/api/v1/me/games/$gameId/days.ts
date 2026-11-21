import { createFileRoute } from '@tanstack/react-router';
import {
  withDeveloperApi,
  apiOptions,
} from '@/lib/api/with-developer-api.server';
import { loadPlaytimeDays } from '@/lib/api/games-data.server';
import {
  daysQuerySchema,
  dayKey,
  resolveDayRange,
} from '@/lib/api/games-serializers.server';
import { isTrackableTitle } from '@/lib/games/route-match';

/**
 * GET /api/v1/me/games/{gameId}/days — the key owner's minutes per UTC day for
 * one title. `from` and `to` are ISO dates and may span at most 90 days.
 */
export const Route =
  createFileRoute(
    '/api/v1/me/games/$gameId/days',
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
                params,
              }) =>
                withDeveloperApi(
                  request,
                  async ({
                    userId,
                    json,
                    error,
                  }) => {
                    if (
                      !isTrackableTitle(
                        params.gameId,
                      )
                    )
                      return error(
                        'not_found',
                        'Game not found.',
                        404,
                      );

                    const url =
                      new URL(
                        request.url,
                      );
                    const parsed =
                      daysQuerySchema.safeParse(
                        {
                          from:
                            url.searchParams.get(
                              'from',
                            ) ??
                            undefined,
                          to:
                            url.searchParams.get(
                              'to',
                            ) ??
                            undefined,
                        },
                      );
                    if (
                      !parsed.success
                    ) {
                      return error(
                        'invalid_request',
                        '`from` and `to` must be ISO dates, YYYY-MM-DD.',
                        400,
                      );
                    }
                    const range =
                      resolveDayRange(
                        parsed.data,
                        new Date(),
                      );
                    if (
                      !range.ok
                    )
                      return error(
                        'invalid_request',
                        range.message,
                        400,
                      );

                    const data =
                      await loadPlaytimeDays(
                        userId,
                        params.gameId,
                        range.from,
                        range.to,
                      );
                    return json(
                      {
                        gameId:
                          params.gameId,
                        from: dayKey(
                          range.from,
                        ),
                        to: dayKey(
                          range.to,
                        ),
                        data,
                      },
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
