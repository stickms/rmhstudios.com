import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { requireMod } from '@/lib/communities/guard.server';
import {
  createSanctionApi,
  listSanctionsApi,
} from '@/lib/communities/bans.contract';
import {
  createSanctionBody,
  listSanctionsQuery,
} from '@/lib/communities/bans-schema';
import {
  listSanctions,
  sanction,
} from '@/lib/communities/bans.server';
import { prisma } from '@/lib/prisma.server';

/**
 * GET  /api/communities/$slug/bans?status=active|past — the Bans tab (moderators only).
 * POST /api/communities/$slug/bans — ban or time out a member; replaces their active sanction.
 */
export const route =
  apiRoute(
    '/api/communities/$slug/bans',
    {
      GET: implement(
        listSanctionsApi,
        {
          rateLimit:
            'read',
          query:
            listSanctionsQuery,
        },
        async ({
          params,
          userId,
          query,
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
          const sanctions =
            await listSanctions(
              guard
                .value
                .id,
              query.status ??
                'active',
            );
          return {
            sanctions,
          };
        },
      ),
      POST: implement(
        createSanctionApi,
        {
          rateLimit:
            'write',
          body: createSanctionBody,
        },
        async ({
          params,
          userId,
          body,
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
          const community =
            await prisma.community.findUnique(
              {
                where:
                  {
                    id: guard
                      .value
                      .id,
                  },
                select:
                  {
                    id: true,
                    name: true,
                    createdById: true,
                  },
              },
            );
          if (
            !community
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
          const result =
            await sanction(
              {
                community,
                actorId:
                  userId,
                actorRole:
                  guard
                    .value
                    .role,
                targetUserId:
                  body.userId,
                kind: body.kind,
                duration:
                  body.duration,
                ruleId:
                  body.ruleId,
                reason:
                  body.reason,
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
          return Response.json(
            {
              success: true,
              id: result.id,
            },
            {
              status: 201,
            },
          );
        },
      ),
    },
  );
