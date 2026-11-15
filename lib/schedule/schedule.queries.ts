/** The "what's on" grid as a route-seeded query (redesign audit B4). Public, same for everyone. */
import { contractQuery } from '@/lib/route/route-query';
import { getScheduleApi } from '@/lib/schedule/schedule.contract';

export const scheduleQuery =
  () =>
    contractQuery(
      [
        'schedule',
        7,
      ],
      getScheduleApi,
      {
        query:
          {
            days: 7,
          },
      },
      // The buckets are floored to midnight UTC server-side; a minute is plenty.
      {
        staleTime: 60_000,
        retry: false,
      },
    );
