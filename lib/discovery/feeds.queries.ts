/** The member's custom feeds as a route-seeded query (redesign audit B4). Signed out: nothing is seeded. */
import { queryOptions } from '@tanstack/react-query';
import { createServerFn } from '@tanstack/react-start';
import { routeQueryFn } from '@/lib/route/route-query';
import { getRequestSession } from '@/lib/auth-session.server';
import { listFeeds } from '@/lib/discovery/feeds.server';
import { api } from '@/lib/contract/client';
import { listFeedsApi } from '@/lib/discovery/discovery.contract';

const listFeedsOnServer = createServerFn({ method: 'GET' }).handler(async () => {
  const session = await getRequestSession();
  if (!session) throw new Error('Unauthorized');
  return listFeeds(session.user.id);
});

export const feedsQuery = () =>
  queryOptions({
    queryKey: ['feeds', 'mine'],
    queryFn: routeQueryFn(
      () => listFeedsOnServer(),
      () => api(listFeedsApi),
    ),
    staleTime: 5_000,
  });
