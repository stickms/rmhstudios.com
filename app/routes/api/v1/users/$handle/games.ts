import { createFileRoute } from '@tanstack/react-router';
import {
  withDeveloperApi,
  apiOptions,
} from '@/lib/api/with-developer-api.server';
import {
  loadPlaytime,
  resolveVisiblePlaytimeOwner,
} from '@/lib/api/games-data.server';

/**
 * GET /api/v1/users/{handle}/games — another member's playtime, as far as their
 * playtime privacy lets the key owner see it. Hidden and unknown are both a
 * 404, so the response never reveals that the data exists.
 */
export const Route =
  createFileRoute(
    '/api/v1/users/$handle/games',
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
                    const ownerId =
                      await resolveVisiblePlaytimeOwner(
                        params.handle,
                        userId,
                      );
                    if (
                      !ownerId
                    )
                      return error(
                        'not_found',
                        'User not found.',
                        404,
                      );
                    return json(
                      {
                        data: await loadPlaytime(
                          ownerId,
                        ),
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
