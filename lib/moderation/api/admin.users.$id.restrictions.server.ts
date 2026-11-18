import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { prisma } from '@/lib/prisma.server';
import { isDeletedAccount } from '@/lib/account-lifecycle';
import { restrictAdminUserApi } from '@/lib/moderation/admin-moderation.contract';
import { restrictBody } from '@/lib/moderation/admin-moderation-schema';
import { restrictFeature } from '@/lib/moderation/restrictions.server';

/** POST /api/admin/users/$id/restrictions — time a user out of one feature. Admin only. */
export const route =
  apiRoute(
    '/api/admin/users/$id/restrictions',
    {
      POST: implement(
        restrictAdminUserApi,
        {
          auth: 'admin',
          rateLimit:
            {
              policy:
                'write',
              scope:
                'user',
            },
          body: restrictBody,
          invalid:
            (
              e,
            ) =>
              Response.json(
                {
                  error:
                    e
                      .issues[0]
                      ?.message ??
                    'Invalid input',
                },
                {
                  status: 400,
                },
              ),
        },
        async ({
          params,
          session,
          body,
        }) => {
          if (
            params.id ===
            session
              .user
              .id
          ) {
            return Response.json(
              {
                error:
                  'You cannot restrict yourself',
              },
              {
                status: 400,
              },
            );
          }
          const target =
            await prisma.user.findUnique(
              {
                where:
                  {
                    id: params.id,
                  },
                select:
                  {
                    id: true,
                    isAdmin: true,
                    banReason: true,
                  },
              },
            );
          if (
            !target
          )
            return Response.json(
              {
                error:
                  'User not found',
              },
              {
                status: 404,
              },
            );
          if (
            isDeletedAccount(
              target,
            )
          ) {
            return Response.json(
              {
                error:
                  'This account has been deleted',
              },
              {
                status: 409,
              },
            );
          }
          if (
            target.isAdmin
          )
            return Response.json(
              {
                error:
                  'Cannot restrict an admin',
              },
              {
                status: 400,
              },
            );

          const restriction =
            await restrictFeature(
              {
                userId:
                  params.id,
                adminId:
                  session
                    .user
                    .id,
                feature:
                  body.feature,
                reason:
                  body.reason,
                durationDays:
                  body.durationDays,
              },
            );
          return Response.json(
            {
              success:
                true as const,
              restriction,
            },
          );
        },
      ),
    },
  );
