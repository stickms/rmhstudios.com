import { tournamentRefusal } from '@/lib/tournaments/tournament-error';
import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { decideMatchResultApi } from '@/lib/tournaments/match-results.contract';
import { decideDispute } from '@/lib/tournaments/match-results.server';
import { decideResultSchema } from '@/lib/tournaments/match-results-schema';
import { TournamentError } from '@/lib/tournaments/tournament-error';

function failure(error: unknown): Response {
  if (error instanceof TournamentError) {
    return Response.json(
      {
        error: error.message,
        ...tournamentRefusal(error),
        code: error.code,
      },
      {
        status: error.status,
      },
    );
  }
  throw error;
}

export const route = apiRoute('/api/tournaments/$id/matches/$matchId/decide', {
  POST: implement(
    decideMatchResultApi,
    {
      rateLimit: {
        limit: 60,
        windowMs: 60_000,
        prefix: 'tournament-decide',
      },
      body: decideResultSchema,
    },
    async ({ userId, isAdmin, params, body }) => {
      try {
        const result = await decideDispute({
          tournamentId: params.id,
          matchId: params.matchId,
          byUserId: userId,
          isAdmin,
          winnerEntrantId: body.winnerEntrantId,
          note: body.note,
        });
        return {
          ok: true as const,
          ...result,
        };
      } catch (error) {
        return failure(error);
      }
    },
  ),
});
