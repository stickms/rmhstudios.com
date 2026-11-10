/** The close-friends circle as a route-seeded query (redesign audit B4). Signed out: nothing is seeded. */
import { queryOptions } from '@tanstack/react-query';
import { createServerFn } from '@tanstack/react-start';
import { api } from '@/lib/contract/client';
import { getCircleApi } from '@/lib/circle.contract';
import { routeQueryFn } from '@/lib/route/route-query';
import { getRequestSession } from '@/lib/auth-session.server';
import { getCircleData } from '@/lib/circle.server';

// Same body as GET /api/circle.
const getCircleOnServer = createServerFn({ method: 'GET' }).handler(async () => {
  const session = await getRequestSession();
  if (!session) throw new Error('Unauthorized');
  return getCircleData(session.user.id);
});

export const circleQuery = () =>
  queryOptions({
    queryKey: ['circle'],
    queryFn: routeQueryFn(
      () => getCircleOnServer(),
      () => api(getCircleApi),
    ),
    staleTime: 15_000,
  });
