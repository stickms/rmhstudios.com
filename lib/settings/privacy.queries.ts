/** The Privacy settings page's two reads (playtime visibility, play limits) as route-seeded queries (redesign audit B4). */
import { queryOptions } from '@tanstack/react-query';
import { createServerFn } from '@tanstack/react-start';
import { api } from '@/lib/contract/client';
import { getPlayLimitsApi } from '@/lib/economy/play-limits.contract';
import { getPlaytimeSettingsApi } from '@/lib/playtime/playtime.contract';
import { routeQueryFn } from '@/lib/route/route-query';
import { getRequestSession } from '@/lib/auth-session.server';
import { getPlayLimits } from '@/lib/economy/play-limits.server';
import { getPlaytimeSettings } from '@/lib/playtime/playtime.server';

// Same bodies as GET /api/settings/playtime-privacy and GET /api/settings/play-limits.
const getPlaytimeOnServer = createServerFn({ method: 'GET' }).handler(async () => {
  const session = await getRequestSession();
  if (!session) throw new Error('Unauthorized');
  return getPlaytimeSettings(session.user.id);
});

const getPlayLimitsOnServer = createServerFn({ method: 'GET' }).handler(async () => {
  const session = await getRequestSession();
  if (!session) throw new Error('Unauthorized');
  return getPlayLimits(session.user.id);
});

export const playtimeSettingsQuery = () =>
  queryOptions({
    queryKey: ['settings', 'playtime-privacy'],
    queryFn: routeQueryFn(
      () => getPlaytimeOnServer(),
      () => api(getPlaytimeSettingsApi),
    ),
    staleTime: 30_000,
  });

export const playLimitsQuery = () =>
  queryOptions({
    queryKey: ['settings', 'play-limits'],
    queryFn: routeQueryFn(
      () => getPlayLimitsOnServer(),
      () => api(getPlayLimitsApi, { retries: 0 }),
    ),
    staleTime: 15_000,
  });
