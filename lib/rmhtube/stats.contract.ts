/** Contracts for the owner's RMHTube watch statistics. Client-safe: types only, no zod. */
import type { z } from 'zod';
import { endpoint } from '@/lib/contract/endpoint';
import type { WatchStats } from '@/lib/rmhtube/stats';
import type { setStatsPausedBody } from '@/lib/rmhtube/stats-schema';

export const getWatchStatsApi = endpoint<{
  res: WatchStats;
}>()({
  method: 'GET',
  path: '/api/rmhtube/stats',
});

/** Clear: resets the counters and deletes the per-day rows. Pause stays as the member set it. */
export const clearWatchStatsApi = endpoint<{
  res: {
    ok: true;
  };
}>()({
  method: 'DELETE',
  path: '/api/rmhtube/stats',
});

export const setWatchStatsPausedApi = endpoint<{
  body: z.infer<typeof setStatsPausedBody>;
  res: {
    paused: boolean;
  };
}>()({
  method: 'PUT',
  path: '/api/rmhtube/stats/pause',
});
