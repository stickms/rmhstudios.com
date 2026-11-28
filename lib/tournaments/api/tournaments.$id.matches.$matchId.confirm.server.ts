import { tournamentErrorResponse } from '@/lib/tournaments/tournament-error';
import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { confirmMatchResultApi } from '@/lib/tournaments/match-results.contract';
import { confirmResult } from '@/lib/tournaments/match-results.server';

export const route = apiRoute('/api/tournaments/$id/matches/$matchId/confirm', {
  POST: implement(
    confirmMatchResultApi,
    {
      rateLimit: {
        limit: 60,
        windowMs: 60_000,
        prefix: 'tournament-confirm',
      },
    },
    async ({ userId, params }) => {
      try {
        const result = await confirmResult({
          tournamentId: params.id,
          matchId: params.matchId,
          userId,
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
