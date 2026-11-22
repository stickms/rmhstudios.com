import { createFileRoute } from '@tanstack/react-router';
import {
  withDeveloperApi,
  apiOptions,
} from '@/lib/api/with-developer-api.server';
import {
  communityPath,
  communityPostsQuery,
} from '@/lib/api/v1/communities-schema';
import { getPostsForKey } from '@/lib/api/v1/communities.server';

/** GET /api/v1/communities/{slug}/posts — the community feed as the site returns it to you, newest first (?cursor, ?flair, ?limit). */
export const Route =
  createFileRoute(
    '/api/v1/communities/$slug/posts',
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
                    const p =
                      communityPath.safeParse(
                        params,
                      );
                    if (
                      !p.success
                    )
                      return error(
                        'invalid_request',
                        p
                          .error
                          .issues[0]
                          ?.message ??
                          'Invalid community.',
                        400,
                      );
                    const q =
                      communityPostsQuery.safeParse(
                        Object.fromEntries(
                          new URL(
                            request.url,
                          )
                            .searchParams,
                        ),
                      );
                    if (
                      !q.success
                    )
                      return error(
                        'invalid_request',
                        q
                          .error
                          .issues[0]
                          ?.message ??
                          'Invalid query.',
                        400,
                      );
                    const posts =
                      await getPostsForKey(
                        p
                          .data
                          .slug,
                        userId,
                        q.data,
                      );
                    if (
                      !posts
                    )
                      return error(
                        'not_found',
                        'Community not found.',
                        404,
                      );
                    return json(
                      posts,
                    );
                  },
                  {
                    scope:
                      'read:communities',
                    cost: 2,
                  },
                ),
            },
        },
    },
  );
