/** `POST /api/rmhtype/daily/finish` - score a run from keystroke counts and the server's own clock. */
import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { finishRmhTypeDailyApi } from '@/lib/rmhtype/daily.contract';
import { dailyFinishBody } from '@/lib/rmhtype/daily-schema';
import { finishDaily } from '@/lib/rmhtype/daily.server';

export const route = apiRoute('/api/rmhtype/daily/finish', {
  POST: implement(
    finishRmhTypeDailyApi,
    {
      rateLimit: 'write',
      body: dailyFinishBody,
    },
    async ({ userId, body }) => {
      const outcome = await finishDaily(userId, body);
      if (outcome.kind === 'state') return outcome.state;
      if (outcome.kind === 'not-started') {
        return Response.json(
          {
            error: 'Start the attempt first',
          },
          {
            status: 409,
          },
        );
      }
      if (outcome.kind === 'already-finished') {
        return Response.json(
          {
            error: 'Already finished',
          },
          {
            status: 409,
          },
        );
      }
      return Response.json(
        {
          error: 'Result rejected',
        },
        {
          status: 422,
        },
      );
    },
  ),
});
