import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { getTournamentApi } from '@/lib/tournaments/tournaments.contract';
import { getTournament } from '@/lib/tournaments/tournament.server';

export const route = apiRoute('/api/tournaments/$id', {
  GET: implement(getTournamentApi, { auth: 'optional' }, async ({ params, session }) => {
    const tournament = await getTournament(params.id, session?.user?.id ?? null);
    if (!tournament) return Response.json({ error: 'Not found' }, { status: 404 });
    return Response.json({ tournament });
  }),
});
