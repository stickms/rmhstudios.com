import { createFileRoute } from '@tanstack/react-router';
import { auth } from '@/lib/auth';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { withdrawFromTournament, TournamentError } from '@/lib/tournaments/tournament.server';

export const Route = createFileRoute('/api/tournaments/$id/withdraw')({
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
            prefix: 'tournament-withdraw',
          });
          if (!allowed) return Response.json({ error: 'Too many requests' }, { status: 429 });

          await withdrawFromTournament({ tournamentId: params.id, userId: session.user.id });
          return Response.json({ ok: true });
        } catch (error) {
          if (error instanceof TournamentError) {
            return Response.json({ error: error.message }, { status: error.status });
          }
          console.error('Tournament withdraw error:', error);
          return Response.json({ error: 'Internal Server Error' }, { status: 500 });
        }
      },
    },
  },
});
