/** The creator studio overview and redemptions as route-seeded queries (redesign audit B4). */
import { queryOptions } from '@tanstack/react-query';
import { createServerFn } from '@tanstack/react-start';
import { api } from '@/lib/contract/client';
import { getCreatorRedemptionsApi } from '@/lib/creator/earnings.contract';
import { studioOverviewApi } from '@/lib/creator/studio.contract';
import { routeQueryFn } from '@/lib/route/route-query';
import { getRequestSession } from '@/lib/auth-session.server';
import { getCreatorEarnings, listMyRedemptions } from '@/lib/creator/earnings.server';
import { getStudioOverview } from '@/lib/creator/studio.server';

// Same bodies as GET /api/creator/studio-overview and GET /api/creator/redeem.
const getOverviewOnServer = createServerFn({ method: 'GET' }).handler(async () => {
  const session = await getRequestSession();
  if (!session) throw new Error('Unauthorized');
  return { overview: await getStudioOverview(session.user.id) };
});

const getRedemptionsOnServer = createServerFn({ method: 'GET' }).handler(async () => {
  const session = await getRequestSession();
  if (!session) throw new Error('Unauthorized');
  const [earnings, requests] = await Promise.all([
    getCreatorEarnings(session.user.id),
    listMyRedemptions(session.user.id),
  ]);
  return { earnings, requests };
});

export const studioOverviewQuery = () =>
  queryOptions({
    queryKey: ['creator', 'studio-overview'],
    queryFn: routeQueryFn(
      () => getOverviewOnServer(),
      () => api(studioOverviewApi),
    ),
    staleTime: 30_000,
  });

export const creatorRedemptionsQuery = () =>
  queryOptions({
    queryKey: ['creator', 'redemptions'],
    queryFn: routeQueryFn(
      () => getRedemptionsOnServer(),
      () => api(getCreatorRedemptionsApi),
    ),
    staleTime: 15_000,
  });
