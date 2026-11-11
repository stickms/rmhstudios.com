/** The "what's on" grid as a route-seeded query (redesign audit B4). Public, same for everyone. */
import { queryOptions } from '@tanstack/react-query';
import { createServerFn } from '@tanstack/react-start';
import { routeQueryFn } from '@/lib/route/route-query';
import { getGrid } from '@/lib/schedule/grid.server';
import { api } from '@/lib/contract/client';
import { getScheduleApi } from '@/lib/schedule/schedule.contract';

const getGridOnServer = createServerFn({ method: 'GET' }).handler(() => getGrid(new Date(), 7));

export const scheduleQuery = () =>
  queryOptions({
    queryKey: ['schedule', 7],
    queryFn: routeQueryFn(
      () => getGridOnServer(),
      () => api(getScheduleApi, { query: { days: 7 } }),
    ),
    // The buckets are floored to midnight UTC server-side; a minute is plenty.
    staleTime: 60_000,
    retry: false,
  });
