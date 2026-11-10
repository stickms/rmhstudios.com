/** The jams list as a route-seeded query (redesign audit B4). Public, same for everyone. */
import { queryOptions } from '@tanstack/react-query';
import { createServerFn } from '@tanstack/react-start';
import { api } from '@/lib/contract/client';
import { routeQueryFn } from '@/lib/route/route-query';
import { listJams } from '@/lib/competitive/jams.server';
import { listJamsApi } from '@/lib/competitive/jams.contract';

const listJamsOnServer = createServerFn({ method: 'GET' }).handler(async () => ({
  jams: await listJams(),
}));

export const jamsQuery = () =>
  queryOptions({
    queryKey: ['jams', 'list'],
    queryFn: routeQueryFn(
      () => listJamsOnServer(),
      () => api(listJamsApi, { retries: 0 }),
    ),
    staleTime: 5_000,
  });
