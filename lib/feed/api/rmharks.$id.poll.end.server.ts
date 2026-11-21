import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { endPollApi } from '@/lib/feed/poll-lifecycle.contract';
import {
  endPoll,
  PollLifecycleError,
} from '@/lib/feed/poll-lifecycle.server';

/** POST /api/rmharks/$id/poll/end — the author ends their open poll now. It shows final results and takes no more votes. */
export const route =
  apiRoute(
    '/api/rmharks/$id/poll/end',
    {
      POST: implement(
        endPollApi,
        {
          rateLimit:
            'write',
        },
        async ({
          params,
          userId,
        }) => {
          try {
            return await endPoll(
              {
                postId:
                  params.id,
                userId,
              },
            );
          } catch (err) {
            if (
              err instanceof
              PollLifecycleError
            ) {
              return Response.json(
                {
                  error:
                    err.message,
                  code: err.code,
                },
                {
                  status:
                    err.status,
                },
              );
            }
            throw err;
          }
        },
      ),
    },
  );
