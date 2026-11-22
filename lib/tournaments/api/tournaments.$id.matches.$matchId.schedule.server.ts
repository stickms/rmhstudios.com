import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import {
  acceptMatchTimeApi,
  proposeMatchTimeApi,
  setMatchTimeApi,
} from '@/lib/tournaments/scheduling.contract';
import {
  acceptTime,
  proposeTime,
  setTimeAsHost,
} from '@/lib/tournaments/scheduling.server';
import {
  acceptTimeSchema,
  hostSetTimeSchema,
  proposeTimeSchema,
} from '@/lib/tournaments/scheduling-schema';
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
    '/api/tournaments/$id/matches/$matchId/schedule',
    {
      // A player proposes a time (replaces any live proposal).
      POST: implement(
        proposeMatchTimeApi,
        {
          rateLimit:
            {
              limit: 30,
              windowMs: 60_000,
              prefix:
                'tournament-propose-time',
            },
          body: proposeTimeSchema,
        },
        async ({
          userId,
          params,
          body,
        }) => {
          try {
            await proposeTime(
              {
                tournamentId:
                  params.id,
                matchId:
                  params.matchId,
                userId,
                at: new Date(
                  body.at,
                ),
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
      // The opponent accepts the proposal it was shown.
      PUT: implement(
        acceptMatchTimeApi,
        {
          rateLimit:
            {
              limit: 30,
              windowMs: 60_000,
              prefix:
                'tournament-accept-time',
            },
          body: acceptTimeSchema,
        },
        async ({
          userId,
          params,
          body,
        }) => {
          try {
            const res =
              await acceptTime(
                {
                  tournamentId:
                    params.id,
                  matchId:
                    params.matchId,
                  userId,
                  proposedAt:
                    new Date(
                      body.proposedAt,
                    ),
                },
              );
            return {
              ok: true as const,
              scheduledAt:
                res.scheduledAt.toISOString(),
            };
          } catch (error) {
            return failure(
              error,
            );
          }
        },
      ),
      // The host (or an admin) sets or clears the time.
      PATCH:
        implement(
          setMatchTimeApi,
          {
            rateLimit:
              {
                limit: 60,
                windowMs: 60_000,
                prefix:
                  'tournament-set-time',
              },
            body: hostSetTimeSchema,
          },
          async ({
            userId,
            isAdmin,
            params,
            body,
          }) => {
            try {
              await setTimeAsHost(
                {
                  tournamentId:
                    params.id,
                  matchId:
                    params.matchId,
                  byUserId:
                    userId,
                  isAdmin,
                  at: body.at
                    ? new Date(
                        body.at,
                      )
                    : null,
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
