import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { confirmMatchResultApi } from '@/lib/tournaments/match-results.contract';
import { confirmResult } from '@/lib/tournaments/match-results.server';
import { TournamentError } from '@/lib/tournaments/tournament-error';

function failure(error: unknown): Response {
  if (error instanceof TournamentError) {
    return Response.json(
      {
        error: error.message,
        code: error.code,
      },
      {
        status: error.status,
      },
    );
  }
  throw error;
}

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
        return failure(error);
      }
    },
  ),
});
