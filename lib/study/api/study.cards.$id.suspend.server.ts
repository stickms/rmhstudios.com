import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { suspendCardApi } from '@/lib/study/queue.contract';
import { suspendCardBody } from '@/lib/study/queue-schema';
import { setSuspended } from '@/lib/study/queue.server';

/** PUT /api/study/cards/$id/suspend — set a card aside for the member, or bring it back. Idempotent. */
export const route =
  apiRoute(
    '/api/study/cards/$id/suspend',
    {
      PUT: implement(
        suspendCardApi,
        {
          rateLimit:
            'write',
          body: suspendCardBody,
        },
        async ({
          userId,
          params,
          body,
        }) => {
          const result =
            await setSuspended(
              userId,
              params.id,
              body.suspended,
            );
          if (
            !result
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
          return {
            success:
              true as const,
            suspended:
              result.suspended,
            reason:
              result.reason,
          };
        },
      ),
    },
  );
