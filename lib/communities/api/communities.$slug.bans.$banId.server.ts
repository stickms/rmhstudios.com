import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { requireMod } from '@/lib/communities/guard.server';
import { liftSanctionApi } from '@/lib/communities/bans.contract';
import { lift } from '@/lib/communities/bans.server';

/** DELETE /api/communities/$slug/bans/$banId — lift a ban or timeout early (moderators only). */
export const route =
  apiRoute(
    '/api/communities/$slug/bans/$banId',
    {
      DELETE:
        implement(
          liftSanctionApi,
          {
            rateLimit:
              'write',
          },
          async ({
            params,
            userId,
          }) => {
            const guard =
              await requireMod(
                params.slug,
                userId,
              );
            if (
              !guard.ok
            )
              return guard.response;
            const result =
              await lift(
                {
                  community:
                    {
                      id: guard
                        .value
                        .id,
                      name: guard
                        .value
                        .name,
                    },
                  banId:
                    params.banId,
                  actorId:
                    userId,
                },
              );
            if (
              !result.ok
            )
              return Response.json(
                {
                  error:
                    result.error,
                },
                {
                  status:
                    result.status,
                },
              );
            return {
              success:
                true as const,
            };
          },
        ),
    },
  );
