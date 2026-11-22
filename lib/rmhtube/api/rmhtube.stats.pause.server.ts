import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { setWatchStatsPausedApi } from '@/lib/rmhtube/stats.contract';
import { setStatsPausedBody } from '@/lib/rmhtube/stats-schema';
import { setPaused } from '@/lib/rmhtube/stats.server';

/** PUT /api/rmhtube/stats/pause: pause or resume recording the member's own watch statistics. */
export const route = apiRoute('/api/rmhtube/stats/pause', {
  PUT: implement(
    setWatchStatsPausedApi,
    {
      rateLimit: 'write',
      body: setStatsPausedBody,
    },
    async ({ userId, body }) => setPaused(userId, body.paused),
  ),
});
