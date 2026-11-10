/** The viewer's feed signals as a route-seeded query (redesign audit B4). Signed out: nothing is seeded. */
import { queryOptions } from '@tanstack/react-query';
import { createServerFn } from '@tanstack/react-start';
import { api } from '@/lib/contract/client';
import { getFeedSignalsApi } from '@/lib/feed/signals.contract';
import { routeQueryFn } from '@/lib/route/route-query';
import { getRequestSession } from '@/lib/auth-session.server';
import { getSignals } from '@/lib/feed/signals.server';

// Same body as GET /api/feed/signal.
const getSignalsOnServer = createServerFn({ method: 'GET' }).handler(async () => {
  const session = await getRequestSession();
  if (!session) throw new Error('Unauthorized');
  return getSignals(session.user.id);
});

export const feedSignalsQuery = () =>
  queryOptions({
    queryKey: ['feed', 'signals'],
    queryFn: routeQueryFn(
      () => getSignalsOnServer(),
      () => api(getFeedSignalsApi),
    ),
    staleTime: 30_000,
  });
