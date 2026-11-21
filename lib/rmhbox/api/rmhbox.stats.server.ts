import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { getRmhboxStatsApi } from '@/lib/rmhbox/rmhbox-reads.contract';
import { statsQuerySchema } from '@/lib/rmhbox/player-stats-schema';
import { getPlayerStats, resolveStatsAccess } from '@/lib/rmhbox/player-stats.server';

/**
 * GET /api/rmhbox/stats?userId= — a player's RMHBox record: headline totals,
 * per-minigame stats and recent matches. Follows the member's game-activity
 * privacy (`resolveStatsAccess`); an unknown, blocked or banned player is a 404.
 */
export const route = apiRoute('/api/rmhbox/stats', {
  GET: implement(
    getRmhboxStatsApi,
    { auth: 'optional', rateLimit: 'read', query: statsQuerySchema },
    async ({ userId, query }) => {
      const decision = await resolveStatsAccess(userId, query.userId);
      if (decision.access === 'none' || !decision.subject) {
        return Response.json({ error: 'Not found' }, { status: 404 });
      }
      const { subject, access } = decision;
      const player = { id: subject.id, name: subject.name, image: subject.image };
      if (access === 'private') {
        return { access, player, global: null, minigames: {}, recentMatches: [] };
      }
      const stats = await getPlayerStats(subject.id, {
        minigame: query.minigame,
        limit: query.limit,
        offset: query.offset,
        withMatches: access === 'full',
      });
      return { access, player, ...stats };
    },
  ),
});
