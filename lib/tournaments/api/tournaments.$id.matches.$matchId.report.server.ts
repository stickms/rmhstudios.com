import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { reportTournamentMatchApi } from '@/lib/tournaments/tournaments.contract';
import { reportMatchSchema } from '@/lib/tournaments/tournament-schema';
import { reportMatch, TournamentError } from '@/lib/tournaments/tournament.server';

export const route = apiRoute('/api/tournaments/$id/matches/$matchId/report', {
  POST: implement(
    reportTournamentMatchApi,
    {
      rateLimit: { limit: 60, windowMs: 60_000, prefix: 'tournament-report' },
      body: reportMatchSchema,
      allowEmptyBody: true,
    },
    async ({ userId, isAdmin, params, body }) => {
      try {
        const result = await reportMatch({
          tournamentId: params.id,
          matchId: params.matchId,
          winnerEntrantId: body.winnerEntrantId,
          reporterId: userId,
          isAdmin,
        });
        return { ok: true as const, ...result };
      } catch (error) {
        if (error instanceof TournamentError) {
          return Response.json({ error: error.message }, { status: error.status });
        }
        throw error;
      }
    },
  ),
});
