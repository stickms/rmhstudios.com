import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { getTrackedAchievementsApi } from '@/lib/achievements/tracking.contract';
import { trackedState } from '@/lib/achievements/tracking-schema';
import { listTracked } from '@/lib/achievements/tracking.server';

/** GET /api/achievements/tracked — the caller's tracked achievements and the rarity table the list sorts by. */
export const route = apiRoute('/api/achievements/tracked', {
  GET: implement(
    getTrackedAchievementsApi,
    {
      rateLimit: 'read',
      response: trackedState,
    },
    async ({ userId }) => listTracked(userId),
  ),
});
