import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { getRankedStandingApi } from '@/lib/ranked/ranked.contract';
import { getStandings } from '@/lib/ranked/season.server';

/**
 * `GET /api/ranked/standing` — the caller's own standing in every ranked game this season: rating and tier or
 * placements left, record, place on the ladder (a count, never a name), the decay that was shed and the season's end.
 *
 * Signed-in only and about the caller only: it takes no user id. The place honours board privacy (a hidden member's
 * rating never counts toward anyone else's place, and a hidden member sees "not on the ladder").
 */
export const route = apiRoute('/api/ranked/standing', {
  GET: implement(getRankedStandingApi, { rateLimit: 'read' }, async ({ userId }) => {
    const standing = await getStandings(userId);
    return Response.json({
      season: standing.season,
      endsAt: standing.endsAt.toISOString(),
      progress: standing.progress,
      games: standing.games,
    });
  }),
});
