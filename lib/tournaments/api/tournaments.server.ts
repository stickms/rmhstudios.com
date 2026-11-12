import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { createTournamentApi, listTournamentsApi } from '@/lib/tournaments/tournaments.contract';
import { CACHE_POLICY } from '@/lib/api/cache-policies';
import { createTournamentSchema } from '@/lib/tournaments/tournament-schema';
import {
  createTournament,
  listTournaments,
  TournamentError,
} from '@/lib/tournaments/tournament.server';

export const route = apiRoute('/api/tournaments', {
  // Same list for everyone, keyed by ?status=. Display-only: joining and paying
  // go through their own routes, which read fresh (CACHE_POLICY.liveList).
  GET: implement(
    listTournamentsApi,
    {
      auth: 'none',
      // Opt out of the 30 s micro-cache: creating/registering must show in the list.
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
  POST: implement(
    createTournamentApi,
    {
      rateLimit: { limit: 10, windowMs: 60_000, prefix: 'tournament-create' },
      body: createTournamentSchema,
      allowEmptyBody: true,
      invalid: (error) =>
        Response.json({ error: error.issues[0]?.message ?? 'Invalid input' }, { status: 400 }),
    },
    async ({ userId, body }) => {
      try {
        const id = await createTournament({ createdById: userId, ...body });
        return { id };
      } catch (error) {
        if (error instanceof TournamentError) {
          return Response.json({ error: error.message }, { status: error.status });
        }
        throw error;
      }
    },
  ),
});
