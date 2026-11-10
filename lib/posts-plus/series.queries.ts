/** The signed-in member's series as a route-seeded query (redesign audit B4). Signed out: nothing is seeded. */
import { queryOptions } from '@tanstack/react-query';
import { createServerFn } from '@tanstack/react-start';
import { api } from '@/lib/contract/client';
import { routeQueryFn } from '@/lib/route/route-query';
import { getRequestSession } from '@/lib/auth-session.server';
import { listFollowed, listMine } from '@/lib/posts-plus/series.server';
import { listSeriesApi } from '@/lib/posts-plus/series.contract';

const listSeriesOnServer = createServerFn({ method: 'GET' }).handler(async () => {
  const session = await getRequestSession();
  if (!session) throw new Error('Unauthorized');
  const userId = session.user.id;
  const [mine, following] = await Promise.all([listMine(userId), listFollowed(userId)]);
  return { mine, following };
});

export const seriesQuery = () =>
  queryOptions({
    queryKey: ['series', 'mine-and-following'],
    queryFn: routeQueryFn(
      () => listSeriesOnServer(),
      () => api(listSeriesApi),
    ),
    staleTime: 5_000,
  });
