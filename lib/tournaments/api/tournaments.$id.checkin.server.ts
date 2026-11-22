import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { checkInApi, checkInSettingsApi, hostCheckInApi } from '@/lib/tournaments/checkin.contract';
import { checkIn, hostCheckIn, undoHostCheckIn, updateCheckInSettings } from '@/lib/tournaments/checkin.server';
import { checkInSettingsSchema, hostCheckInSchema } from '@/lib/tournaments/tournament-schema';
import { TournamentError } from '@/lib/tournaments/tournament.server';

function failure(error: unknown): Response {
  if (error instanceof TournamentError) {
    return Response.json({ error: error.message, code: error.code }, { status: error.status });
  }
  throw error;
}

export const route = apiRoute('/api/tournaments/$id/checkin', {
  // Self: the caller's own entrant row, never a user id from the request.
  POST: implement(
    checkInApi,
    { rateLimit: { limit: 30, windowMs: 60_000, prefix: 'tournament-checkin' } },
    async ({ userId, params }) => {
      try {
        await checkIn({ tournamentId: params.id, userId });
        return { ok: true as const };
      } catch (error) {
        return failure(error);
      }
    },
  ),
  // Host: check an entrant in by hand, or undo it.
  PUT: implement(
    hostCheckInApi,
    {
      rateLimit: { limit: 60, windowMs: 60_000, prefix: 'tournament-checkin-host' },
      body: hostCheckInSchema,
    },
    async ({ userId, isAdmin, params, body }) => {
      try {
        const opts = {
          tournamentId: params.id,
          byUserId: userId,
          isAdmin,
          userId: body.userId,
        };
        if (body.checkedIn) await hostCheckIn(opts);
        else await undoHostCheckIn(opts);
        return { ok: true as const };
      } catch (error) {
        return failure(error);
      }
    },
  ),
  // Host: the window setting.
  PATCH: implement(
    checkInSettingsApi,
    {
      rateLimit: { limit: 20, windowMs: 60_000, prefix: 'tournament-checkin-settings' },
      body: checkInSettingsSchema,
    },
    async ({ userId, isAdmin, params, body }) => {
      try {
        await updateCheckInSettings({
          tournamentId: params.id,
          byUserId: userId,
          isAdmin,
          checkInMinutes: body.checkInMinutes,
        });
        return { ok: true as const };
      } catch (error) {
        return failure(error);
      }
    },
  ),
});
