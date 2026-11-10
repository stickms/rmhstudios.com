/** The member's custom feeds as a route-seeded query (redesign audit B4). Signed out: nothing is seeded. */
import { queryOptions } from '@tanstack/react-query';
import { createServerFn } from '@tanstack/react-start';
import { routeQueryFn } from '@/lib/route/route-query';
import { getRequestSession } from '@/lib/auth-session.server';
import { listFeeds } from '@/lib/discovery/feeds.server';

const listFeedsOnServer = createServerFn({ method: 'GET' }).handler(async () => {
  const session = await getRequestSession();
  if (!session) throw new Error('Unauthorized');
  return listFeeds(session.user.id);
});

/** `T` is the wire shape the page declares for `/api/feeds`. */
export const feedsQuery = <T>() =>
  queryOptions({
    queryKey: ['feeds', 'mine'],
    queryFn: routeQueryFn<T>(
      () => listFeedsOnServer(),
      async () => {
        const res = await fetch('/api/feeds', { credentials: 'include' });
        if (!res.ok) throw new Error(String(res.status));
        return (await res.json()) as T;
      },
    ),
    staleTime: 5_000,
  });
