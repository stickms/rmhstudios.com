/** The "what's on" grid as a route-seeded query (redesign audit B4). Public, same for everyone. */
import { contractQuery } from '@/lib/route/route-query';
import { getMyScheduleApi, getScheduleApi } from '@/lib/schedule/schedule.contract';

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

/** The signed-in member's own week (the "Yours" tab of /calendar). Private, so never prefetched by SSR. */
export const myScheduleQuery = (enabled: boolean) =>
  contractQuery(['schedule', 'mine', 7], getMyScheduleApi, { query: { days: 7 } }, {
    staleTime: 30_000,
    retry: false,
    enabled,
  });
