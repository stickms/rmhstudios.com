import { tournamentRefusal } from '@/lib/tournaments/tournament-error';
import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { withdrawMatchClaimApi } from '@/lib/tournaments/match-results.contract';
import { withdrawClaim } from '@/lib/tournaments/match-results.server';
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

export const route = apiRoute('/api/tournaments/$id/matches/$matchId/withdraw', {
  POST: implement(
    withdrawMatchClaimApi,
    {
      rateLimit: {
        limit: 30,
        windowMs: 60_000,
        prefix: 'tournament-withdraw-claim',
      },
    },
    async ({ userId, params }) => {
      try {
        await withdrawClaim({
          tournamentId: params.id,
          matchId: params.matchId,
          userId,
        });
        return {
          ok: true as const,
        };
      } catch (error) {
        return failure(error);
      }
    },
  ),
});
