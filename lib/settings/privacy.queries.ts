/** The Privacy settings page's two reads (playtime visibility, play limits) as route-seeded queries (redesign audit B4). */
import { getPlayLimitsApi } from '@/lib/economy/play-limits.contract';
import { getPlaytimeSettingsApi } from '@/lib/playtime/playtime.contract';
import { contractQuery } from '@/lib/route/route-query';

export const playtimeSettingsQuery = () =>
  contractQuery(['settings', 'playtime-privacy'], getPlaytimeSettingsApi, undefined, {
    staleTime: 30_000,
  });

export const playLimitsQuery = () =>
  contractQuery(
    ['settings', 'play-limits'],
    getPlayLimitsApi,
    { retries: 0 },
    { staleTime: 15_000 },
  );
