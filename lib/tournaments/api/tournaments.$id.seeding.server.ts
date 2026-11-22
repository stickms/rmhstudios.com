import { tournamentRefusal } from '@/lib/tournaments/tournament-error';
import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { getSeedingApi, updateSeedingApi } from '@/lib/tournaments/seeding.contract';
import { projectedSeeds, updateSeeding } from '@/lib/tournaments/seeding.server';
import { updateSeedingSchema } from '@/lib/tournaments/seeding-schema';
import { TournamentError } from '@/lib/tournaments/tournament.server';

function failure(error: unknown): Response {
  if (error instanceof TournamentError) {
    return Response.json(
      { error: error.message, ...tournamentRefusal(error), code: error.code },
      { status: error.status },
    );
  }
  throw error;
}

export const route = apiRoute('/api/tournaments/$id/seeding', {
  // Readable signed out; a manual order is only ever in the host's copy.
  GET: implement(getSeedingApi, { auth: 'optional', rateLimit: 'read' }, async ({ params, session, isAdmin }) => {
    const view = await projectedSeeds({
      tournamentId: params.id,
      viewerId: session?.user?.id ?? null,
      isAdmin,
    });
    if (!view) return Response.json({ error: 'Tournament not found' }, { status: 404 });
    return view;
  }),
  // Host: the method and/or the hand order.
  PUT: implement(
    updateSeedingApi,
    {
      rateLimit: { limit: 60, windowMs: 60_000, prefix: 'tournament-seeding' },
      body: updateSeedingSchema,
    },
    async ({ userId, isAdmin, params, body }) => {
      try {
        await updateSeeding({ tournamentId: params.id, byUserId: userId, isAdmin, ...body });
        return { ok: true as const };
      } catch (error) {
        return failure(error);
      }
    },
  ),
});
