import { tournamentErrorResponse } from '@/lib/tournaments/tournament-error';
import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { awardMatchApi } from '@/lib/tournaments/scheduling.contract';
import { awardWalkover } from '@/lib/tournaments/scheduling.server';
import { awardMatchSchema } from '@/lib/tournaments/scheduling-schema';

export const route = apiRoute('/api/tournaments/$id/matches/$matchId/award', {
  // Host (or admin): award an overdue match. Nothing is ever awarded automatically.
  POST: implement(
    awardMatchApi,
    {
      rateLimit: {
        limit: 30,
        windowMs: 60_000,
        prefix: 'tournament-award',
      },
      body: awardMatchSchema,
    },
    async ({ userId, isAdmin, params, body }) => {
      try {
        const result = await awardWalkover({
          tournamentId: params.id,
          matchId: params.matchId,
          byUserId: userId,
          isAdmin,
          winnerEntrantId: body.winnerEntrantId,
        });
        return {
          ok: true as const,
          ...result,
        };
      } catch (error) {
        return tournamentErrorResponse(error);
      }
    },
  ),
});
