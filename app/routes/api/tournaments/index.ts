import { createFileRoute } from '@tanstack/react-router';
import { auth } from '@/lib/auth';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { createTournamentSchema } from '@/lib/tournaments/tournament-schema';
import {
  createTournament,
  listTournaments,
  TournamentError,
} from '@/lib/tournaments/tournament.server';

export const Route = createFileRoute('/api/tournaments/')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const status = new URL(request.url).searchParams.get('status');
          const valid =
            status === 'REGISTRATION' || status === 'LIVE' || status === 'COMPLETE'
              ? status
              : undefined;
          const tournaments = await listTournaments({ status: valid });
          return Response.json({ tournaments });
        } catch (error) {
          console.error('Tournament list error:', error);
          return Response.json({ error: 'Internal Server Error' }, { status: 500 });
        }
      },
      POST: async ({ request }) => {
        try {
          const session = await auth.api.getSession({ headers: request.headers });
          if (!session?.user?.id) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
          }
          const { allowed } = rateLimit(getClientIp(request), {
            limit: 10,
            windowMs: 60_000,
            prefix: 'tournament-create',
          });
          if (!allowed) return Response.json({ error: 'Too many requests' }, { status: 429 });

          const parsed = createTournamentSchema.safeParse(await request.json().catch(() => ({})));
          if (!parsed.success) {
            return Response.json(
              { error: parsed.error.issues[0]?.message ?? 'Invalid input' },
              { status: 400 },
            );
          }
          const id = await createTournament({
            createdById: session.user.id,
            ...parsed.data,
          });
          return Response.json({ id });
        } catch (error) {
          if (error instanceof TournamentError) {
            return Response.json({ error: error.message }, { status: error.status });
          }
          console.error('Tournament create error:', error);
          return Response.json({ error: 'Internal Server Error' }, { status: 500 });
        }
      },
    },
  },
});
