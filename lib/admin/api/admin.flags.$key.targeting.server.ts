import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import {
  editFlagTargetingApi,
  getFlagTargetingApi,
} from '@/lib/flags/targeting.contract';
import { targetingEditBody } from '@/lib/flags/targeting-schema';
import {
  editFlagTargeting,
  getFlagTargeting,
} from '@/lib/flags/targeting.server';
import { isValidFlagKey } from '@/lib/flags/key';

const notFound =
  () =>
    Response.json(
      {
        error:
          'Not found',
      },
      {
        status: 404,
      },
    );

/**
 * /api/admin/flags/$key/targeting — a flag's allow and deny lists (admin only).
 *   GET the two lists, members resolved for display
 *   PUT { list, add: handles, remove: member ids } — a member is never in both lists, each holds at most 200
 */
export const route =
  apiRoute(
    '/api/admin/flags/$key/targeting',
    {
      GET: implement(
        getFlagTargetingApi,
        {
          auth: 'admin',
          rateLimit:
            'read',
        },
        async ({
          params,
        }) => {
          if (
            !isValidFlagKey(
              params.key,
            )
          )
            return notFound();
          const targeting =
            await getFlagTargeting(
              params.key,
            );
          return (
            targeting ??
            notFound()
          );
        },
      ),
      PUT: implement(
        editFlagTargetingApi,
        {
          auth: 'admin',
          rateLimit:
            'write',
          body: targetingEditBody,
        },
        async ({
          params,
          userId,
          body,
        }) => {
          if (
            !isValidFlagKey(
              params.key,
            )
          )
            return notFound();
          const outcome =
            await editFlagTargeting(
              {
                key: params.key,
                adminId:
                  userId,
                list: body.list,
                addHandles:
                  body.add,
                removeIds:
                  body.remove,
              },
            );
          if (
            outcome.ok
          )
            return outcome.targeting;
          if (
            outcome.code ===
            'not-found'
          )
            return notFound();
          if (
            outcome.code ===
            'full'
          ) {
            return Response.json(
              {
                error:
                  'A list holds at most 200 members',
                code: 'full',
              },
              {
                status: 409,
              },
            );
          }
          return Response.json(
            {
              error:
                'No member has that handle',
              code: 'unknown-handle',
              handles:
                outcome.handles,
            },
            {
              status: 404,
            },
          );
        },
      ),
    },
  );
