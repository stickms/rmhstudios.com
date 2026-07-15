import { createFileRoute } from '@tanstack/react-router';
import { auth } from '@/lib/auth';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import {
  startTournament,
  notifyTournamentStarted,
  TournamentError,
} from '@/lib/tournaments/tournament.server';
import { seedTournamentMarket } from '@/lib/predictions/auto-markets.server';

export const Route = createFileRoute('/api/tournaments/$id/start')({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        try {
          const session = await auth.api.getSession({ headers: request.headers });
          if (!session?.user?.id) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
          }
          const { allowed } = rateLimit(getClientIp(request), {
            limit: 10,
            windowMs: 60_000,
            prefix: 'tournament-start',
          });
          if (!allowed) return Response.json({ error: 'Too many requests' }, { status: 429 });

          await startTournament({
            tournamentId: params.id,
            byUserId: session.user.id,
            isAdmin: (session.user as { isAdmin?: boolean }).isAdmin,
          });
          void notifyTournamentStarted(params.id).catch(() => {});
          // Self-referential market: "will the top seed win?" (best-effort).
          void seedTournamentMarket(params.id).catch(() => {});
          return Response.json({ ok: true });
        } catch (error) {
          if (error instanceof TournamentError) {
            return Response.json({ error: error.message }, { status: error.status });
          }
          console.error('Tournament start error:', error);
          return Response.json({ error: 'Internal Server Error' }, { status: 500 });
        }
      },
    },
  },
});
