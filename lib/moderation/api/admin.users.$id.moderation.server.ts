import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { prisma } from '@/lib/prisma.server';
import { getAdminUserModerationApi } from '@/lib/moderation/admin-moderation.contract';
import { listRestrictions } from '@/lib/moderation/restrictions.server';

/** GET /api/admin/users/$id/moderation — strikes, timeouts and ban for one user. Admin only. */
export const route =
  apiRoute(
    '/api/admin/users/$id/moderation',
    {
      GET: implement(
        getAdminUserModerationApi,
        {
          auth: 'admin',
          microCache: false,
        },
        async ({
          params,
        }) => {
          const [
            user,
            strikes,
            restrictions,
          ] =
            await Promise.all(
              [
                prisma.user.findUnique(
                  {
                    where:
                      {
                        id: params.id,
                      },
                    select:
                      {
                        bannedUntil: true,
                        banReason: true,
                      },
                  },
                ),
                prisma.userStrike.findMany(
                  {
                    where:
                      {
                        userId:
                          params.id,
                      },
                    orderBy:
                      {
                        createdAt:
                          'desc',
                      },
                    take: 100,
                    select:
                      {
                        id: true,
                        reason: true,
                        createdAt: true,
                        expiresAt: true,
                        appealStatus: true,
                        entityType: true,
                        entityId: true,
                      },
                  },
                ),
                listRestrictions(
                  params.id,
                ),
              ],
            );
          if (
            !user
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

          const now =
            Date.now();
          const rows =
            strikes.map(
              (
                s,
              ) => ({
                id: s.id,
                reason:
                  s.reason,
                createdAt:
                  s.createdAt.toISOString(),
                expiresAt:
                  s.expiresAt?.toISOString() ??
                  null,
                // Same rule as `activeStrikeWhere`: unexpired and not overturned.
                active:
                  (!s.expiresAt ||
                    s.expiresAt.getTime() >
                      now) &&
                  s.appealStatus !==
                    'OVERTURNED',
                appealStatus:
                  s.appealStatus,
                entityType:
                  s.entityType,
                entityId:
                  s.entityId,
              }),
            );
          const banned =
            !!user.bannedUntil &&
            user.bannedUntil.getTime() >
              now;
          return {
            activeStrikes:
              rows.filter(
                (
                  r,
                ) =>
                  r.active,
              )
                .length,
            strikes:
              rows,
            restrictions,
            bannedUntil:
              banned
                ? user.bannedUntil!.toISOString()
                : null,
            banReason:
              banned
                ? user.banReason
                : null,
          };
        },
      ),
    },
  );
