import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { extendPollApi } from '@/lib/feed/poll-lifecycle.contract';
import { extendPollSchema } from '@/lib/feed/poll-lifecycle-schema';
import { extendPoll, PollLifecycleError } from '@/lib/feed/poll-lifecycle.server';

/** POST /api/rmharks/$id/poll/extend — the author gives their open, timed poll 1, 3 or 7 more days (30 days from the post at most). */
export const route = apiRoute('/api/rmharks/$id/poll/extend', {
  POST: implement(
    extendPollApi,
    {
      rateLimit: 'write',
      body: extendPollSchema,
    },
    async ({ params, userId, body }) => {
      try {
        return await extendPoll({
          postId: params.id,
          userId,
          days: body.days,
        });
      } catch (err) {
        if (err instanceof PollLifecycleError) {
          return Response.json(
            {
              error: err.message,
              code: err.code,
            },
            {
              status: err.status,
            },
          );
        }
        throw err;
      }
    },
  ),
});
