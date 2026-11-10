/** The viewer's account standing as a route-seeded query (redesign audit B4). Signed out: nothing is seeded. */
import { queryOptions } from '@tanstack/react-query';
import { createServerFn } from '@tanstack/react-start';
import { api } from '@/lib/contract/client';
import { accountStandingApi } from '@/lib/moderation/standing.contract';
import { routeQueryFn } from '@/lib/route/route-query';
import { getRequestSession } from '@/lib/auth-session.server';
import { getAccountStanding } from '@/lib/moderation/standing.server';

// Same body as GET /api/account/standing.
const getStandingOnServer = createServerFn({ method: 'GET' }).handler(async () => {
  const session = await getRequestSession();
  if (!session) throw new Error('Unauthorized');
  return getAccountStanding(session.user.id);
});

export const accountStandingQuery = () =>
  queryOptions({
    queryKey: ['account', 'standing'],
    queryFn: routeQueryFn(
      () => getStandingOnServer(),
      () => api(accountStandingApi),
    ),
    staleTime: 15_000,
  });
