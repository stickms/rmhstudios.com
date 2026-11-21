/** `POST /api/rmhtype/daily/start` - use today's attempt; a second call returns the first. */
import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { startRmhTypeDailyApi } from '@/lib/rmhtype/daily.contract';
import { startDaily } from '@/lib/rmhtype/daily.server';

export const route =
  apiRoute(
    '/api/rmhtype/daily/start',
    {
      POST: implement(
        startRmhTypeDailyApi,
        {
          rateLimit:
            'write',
        },
        async ({
          userId,
        }) =>
          startDaily(
            userId,
          ),
      ),
    },
  );
