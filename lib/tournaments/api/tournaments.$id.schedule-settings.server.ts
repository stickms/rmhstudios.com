import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { scheduleSettingsApi } from '@/lib/tournaments/scheduling.contract';
import { updateDeadlineSettings } from '@/lib/tournaments/scheduling.server';
import { scheduleSettingsSchema } from '@/lib/tournaments/scheduling-schema';
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
    '/api/tournaments/$id/schedule-settings',
    {
      // Host (or admin): the match deadline, until the tournament completes.
      PUT: implement(
        scheduleSettingsApi,
        {
          rateLimit:
            {
              limit: 20,
              windowMs: 60_000,
              prefix:
                'tournament-schedule-settings',
            },
          body: scheduleSettingsSchema,
        },
        async ({
          userId,
          isAdmin,
          params,
          body,
        }) => {
          try {
            await updateDeadlineSettings(
              {
                tournamentId:
                  params.id,
                byUserId:
                  userId,
                isAdmin,
                matchDeadlineHours:
                  body.matchDeadlineHours,
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
