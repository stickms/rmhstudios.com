/** The signed-in creator's own analytics as a route-seeded query (redesign audit B4). Signed out: nothing is seeded. */
import { queryOptions } from '@tanstack/react-query';
import { createServerFn } from '@tanstack/react-start';
import { api } from '@/lib/contract/client';
import { getCreatorAnalyticsApi } from '@/lib/profile/profile-extras.contract';
import { routeQueryFn } from '@/lib/route/route-query';
import { getRequestSession } from '@/lib/auth-session.server';
import { getCreatorAnalytics } from '@/lib/analytics.server';

// Same body as GET /api/profile/analytics.
const getCreatorAnalyticsOnServer = createServerFn({ method: 'GET' }).handler(async () => {
  const session = await getRequestSession();
  if (!session) throw new Error('Unauthorized');
  return getCreatorAnalytics(session.user.id);
});

export const creatorAnalyticsQuery = () =>
  queryOptions({
    queryKey: ['profile', 'analytics'],
    queryFn: routeQueryFn(
      () => getCreatorAnalyticsOnServer(),
      () => api(getCreatorAnalyticsApi, { retries: 0 }),
    ),
    staleTime: 30_000,
  });
