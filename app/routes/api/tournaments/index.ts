import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { CACHE_POLICY } from '@/lib/api/cache-policies';
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
      // Same list for everyone, keyed by ?status=. Display-only: joining and paying
      // go through their own routes, which read fresh (CACHE_POLICY.liveList).
      GET: defineHandler(
        {
          auth: 'none',
          // Opt out of the in-process micro-cache so the ORIGIN is never stale after a
          // create/register; the liveList HTTP window (15 s browser, 30 s shared) still
          // applies, which is the staleness this display-only list accepts.
          microCache: false,
          cache: CACHE_POLICY.liveList,
        },
        async ({ request }) => {
          const status = new URL(request.url).searchParams.get('status');
          const valid =
            status === 'REGISTRATION' || status === 'LIVE' || status === 'COMPLETE'
              ? status
              : undefined;
          const tournaments = await listTournaments({ status: valid });
          return Response.json({ tournaments });
        },
      ),
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
