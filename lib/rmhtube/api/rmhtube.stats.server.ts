import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { clearWatchStatsApi, getWatchStatsApi } from '@/lib/rmhtube/stats.contract';
import { clearStats, getMyStats } from '@/lib/rmhtube/stats.server';

/**
 * GET /api/rmhtube/stats: the signed-in member's own watch statistics. DELETE clears them.
 * Owner only by construction: both read the session's user id and nothing in the request names a member.
 */
export const route = apiRoute('/api/rmhtube/stats', {
  GET: implement(
    getWatchStatsApi,
    {
      rateLimit: 'read',
    },
    async ({ userId }) => {
      const stats = await getMyStats(userId);
      return Response.json(stats, {
        headers: {
          'Cache-Control': 'private, no-store',
        },
      });
    },
  ),
  DELETE: implement(
    clearWatchStatsApi,
    {
      rateLimit: 'write',
    },
    async ({ userId }) => {
      await clearStats(userId);
      return {
        ok: true as const,
      };
    },
  ),
});
