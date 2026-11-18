import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { liftAdminRestrictionApi } from '@/lib/moderation/admin-moderation.contract';
import { liftRestriction } from '@/lib/moderation/restrictions.server';

/** DELETE /api/admin/restrictions/$id — lift a feature timeout early. Admin only. */
export const route =
  apiRoute(
    '/api/admin/restrictions/$id',
    {
      DELETE:
        implement(
          liftAdminRestrictionApi,
          {
            auth: 'admin',
            rateLimit:
              {
                policy:
                  'write',
                scope:
                  'user',
              },
          },
          async ({
            params,
            session,
          }) => {
            const {
              lifted,
              userId,
            } =
              await liftRestriction(
                {
                  id: params.id,
                  adminId:
                    session
                      .user
                      .id,
                },
              );
            if (
              !userId
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
            return Response.json(
              {
                success:
                  true as const,
                lifted,
              },
            );
          },
        ),
    },
  );
