import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { getFocusHistoryApi } from '@/lib/rmhstudy/history.contract';
import { historyQuery } from '@/lib/rmhstudy/history-schema';
import { getFocusHistory } from '@/lib/rmhstudy/history.server';
import {
  DEFAULT_TIME_ZONE,
  isValidTimeZone,
} from '@/lib/study/stats';

/** GET /api/rmhstudy/history?tz=&weekOffset=&firstDay= — the signed-in member's own focus history. */
export const route =
  apiRoute(
    '/api/rmhstudy/history',
    {
      GET: implement(
        getFocusHistoryApi,
        {
          rateLimit:
            'read',
          query:
            historyQuery,
        },
        async ({
          userId,
          query,
        }) => {
          const timeZone =
            query.tz ??
            DEFAULT_TIME_ZONE;
          if (
            !isValidTimeZone(
              timeZone,
            )
          ) {
            return Response.json(
              {
                error:
                  'Invalid time zone',
              },
              {
                status: 400,
              },
            );
          }
          return getFocusHistory(
            userId,
            {
              timeZone,
              weekOffset:
                query.weekOffset ??
                0,
              firstDay:
                query.firstDay ??
                1,
            },
          );
        },
      ),
    },
  );
