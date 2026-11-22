import { createFileRoute } from '@tanstack/react-router';
import {
  withDeveloperApi,
  apiOptions,
} from '@/lib/api/with-developer-api.server';
import { communityPath } from '@/lib/api/v1/communities-schema';
import { getCommunityForKey } from '@/lib/api/v1/communities.server';

/** GET /api/v1/communities/{slug} — a community you can see: posting requirements, flairs and whether you are a member. A private community you are not in is a 404. */
export const Route =
  createFileRoute(
    '/api/v1/communities/$slug',
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
                    const community =
                      await getCommunityForKey(
                        p
                          .data
                          .slug,
                        userId,
                      );
                    if (
                      !community
                    )
                      return error(
                        'not_found',
                        'Community not found.',
                        404,
                      );
                    return json(
                      community,
                    );
                  },
                  {
                    scope:
                      'read:communities',
                  },
                ),
            },
        },
    },
  );
