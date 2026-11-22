import { createFileRoute } from '@tanstack/react-router';
import {
  withDeveloperApi,
  apiOptions,
} from '@/lib/api/with-developer-api.server';
import {
  myEventsQuery,
  resolveWindow,
} from '@/lib/api/v1/events-schema';
import {
  listMyEventsForKey,
  queryOf,
  readInput,
} from '@/lib/api/v1/events.server';

/** GET /api/v1/me/events — the dates you answered going or maybe, inside a window of at most 31 days. */
export const Route =
  createFileRoute(
    '/api/v1/me/events',
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
                    const q =
                      readInput(
                        queryOf(
                          request,
                        ),
                        myEventsQuery,
                      );
                    if (
                      !q.ok
                    )
                      return error(
                        'invalid_request',
                        q.message,
                        400,
                      );
                    const window =
                      resolveWindow(
                        q.data,
                        new Date(),
                      );
                    if (
                      !window.ok
                    )
                      return error(
                        'invalid_request',
                        window.message,
                        400,
                      );
                    const page =
                      await listMyEventsForKey(
                        userId,
                        {
                          from: window.from,
                          to: window.to,
                          limit:
                            q
                              .data
                              .limit,
                          cursor:
                            q
                              .data
                              .cursor,
                        },
                      );
                    if (
                      page ===
                      'invalid_cursor'
                    )
                      return error(
                        'invalid_request',
                        'Invalid cursor.',
                        400,
                      );
                    return json(
                      page,
                    );
                  },
                  {
                    scope:
                      'read:events',
                  },
                ),
            },
        },
    },
  );
