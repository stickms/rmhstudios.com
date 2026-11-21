import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { disputeMatchResultApi } from '@/lib/tournaments/match-results.contract';
import { disputeResult } from '@/lib/tournaments/match-results.server';
import { disputeResultSchema } from '@/lib/tournaments/match-results-schema';
import { TournamentError } from '@/lib/tournaments/tournament-error';

function failure(
  error: unknown,
): Response {
  if (
    error instanceof
    TournamentError
  ) {
    return Response.json(
      {
        error:
          error.message,
        code: error.code,
      },
      {
        status:
          error.status,
      },
    );
  }
  throw error;
}

export const route =
  apiRoute(
    '/api/tournaments/$id/matches/$matchId/dispute',
    {
      POST: implement(
        disputeMatchResultApi,
        {
          rateLimit:
            {
              limit: 30,
              windowMs: 60_000,
              prefix:
                'tournament-dispute',
            },
          body: disputeResultSchema,
          allowEmptyBody: true,
        },
        async ({
          userId,
          params,
          body,
        }) => {
          try {
            await disputeResult(
              {
                tournamentId:
                  params.id,
                matchId:
                  params.matchId,
                userId,
                note: body.note,
              },
            );
            return {
              ok: true as const,
            };
          } catch (error) {
            return failure(
              error,
            );
          }
        },
      ),
    },
  );
