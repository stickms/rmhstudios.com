import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { clearPersonalBestsApi, getPersonalBestsApi } from '@/lib/game/personal-bests.contract';
import { clearPersonalBests, listPersonalBests } from '@/lib/game/personal-bests.server';
import { getGameScoreRules, scoredGameIds } from '@/lib/game/registry';

/**
 * `/api/games/$id/personal-bests` — the caller's own record history in one game (sprint 05 #04).
 * Both handlers act on the session's user id only, so nobody can read or clear another member's
 * history; there is no public or per-member variant. The id must be a scored game.
 */
export const route = apiRoute('/api/games/$id/personal-bests', {
  GET: implement(
    getPersonalBestsApi,
    {
      rateLimit: 'read',
    },
    async ({ userId, params }) => {
      const rules = scoredGameIds().includes(params.id) ? getGameScoreRules(params.id) : undefined;
      if (!rules)
        return Response.json(
          {
            error: 'Unknown game',
          },
          {
            status: 400,
          },
        );
      return Response.json(
        {
          lowerIsBetter: rules.direction === 'lower-is-better',
          rows: await listPersonalBests(userId, rules.id),
        },
        {
          headers: {
            'Cache-Control': 'private, no-store',
          },
        },
      );
    },
  ),
  DELETE: implement(
    clearPersonalBestsApi,
    {
      rateLimit: 'write',
    },
    async ({ userId, params }) => {
      if (!scoredGameIds().includes(params.id)) {
        return Response.json(
          {
            error: 'Unknown game',
          },
          {
            status: 400,
          },
        );
      }
      return {
        cleared: await clearPersonalBests(userId, params.id),
      };
    },
  ),
});
