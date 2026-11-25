import { tournamentRefusal } from '@/lib/tournaments/tournament-error';
import { createFileRoute } from '@tanstack/react-router';
import { auth } from '@/lib/auth';
import { isAppError } from '@/lib/errors/codes';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { registerForTournament, TournamentError } from '@/lib/tournaments/tournament.server';

export const Route = createFileRoute('/api/tournaments/$id/register')({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        try {
          const session = await auth.api.getSession({ headers: request.headers });
          if (!session?.user?.id) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
          }
          const { allowed } = rateLimit(getClientIp(request), {
            limit: 30,
            windowMs: 60_000,
            prefix: 'tournament-register',
          });
          if (!allowed) return Response.json({ error: 'Too many requests' }, { status: 429 });

          await registerForTournament({ tournamentId: params.id, userId: session.user.id });
          return Response.json({ ok: true });
        } catch (error) {
          // A refused stake (self-exclusion, cool-off, daily cap; W8) carries its own status and code.
          if (isAppError(error)) return Response.json(error.toBody(), { status: error.status });
          if (error instanceof TournamentError) {
            return Response.json({ error: error.message, ...tournamentRefusal(error) }, { status: error.status });
          }
          console.error('Tournament register error:', error);
          return Response.json({ error: 'Internal Server Error' }, { status: 500 });
        }
      },
    },
  },
});
