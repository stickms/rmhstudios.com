import { createFileRoute } from '@tanstack/react-router';
import { auth } from '@/lib/auth';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { reportMatchSchema } from '@/lib/tournaments/tournament-schema';
import { reportMatch, TournamentError } from '@/lib/tournaments/tournament.server';

export const Route = createFileRoute('/api/tournaments/$id/matches/$matchId/report')({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        try {
          const session = await auth.api.getSession({ headers: request.headers });
          if (!session?.user?.id) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
          }
          const { allowed } = rateLimit(getClientIp(request), {
            limit: 60,
            windowMs: 60_000,
            prefix: 'tournament-report',
          });
          if (!allowed) return Response.json({ error: 'Too many requests' }, { status: 429 });

          const parsed = reportMatchSchema.safeParse(await request.json().catch(() => ({})));
          if (!parsed.success) return Response.json({ error: 'Invalid input' }, { status: 400 });

          const result = await reportMatch({
            tournamentId: params.id,
            matchId: params.matchId,
            winnerEntrantId: parsed.data.winnerEntrantId,
            reporterId: session.user.id,
            isAdmin: (session.user as { isAdmin?: boolean }).isAdmin,
          });
          return Response.json({ ok: true, ...result });
        } catch (error) {
          if (error instanceof TournamentError) {
            return Response.json({ error: error.message }, { status: error.status });
          }
          console.error('Tournament report error:', error);
          return Response.json({ error: 'Internal Server Error' }, { status: 500 });
        }
      },
    },
  },
});
