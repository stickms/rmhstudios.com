import { CACHE_POLICY } from '@/lib/api/cache-policies';
import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { getGameUpdatesApi } from '@/lib/arcade/updates.contract';
import { updatesQuery } from '@/lib/arcade/updates-schema';
import { listPatchNotes, updatesGame } from '@/lib/arcade/updates.server';

/** GET /api/games/:gameId/updates?cursor= — one page of a game's patch notes, newest first. Public. */
export const route = apiRoute('/api/games/$gameId/updates', {
  GET: implement(
    getGameUpdatesApi,
    {
      auth: 'none',
      // Editing or deleting a note invalidates its cache; the micro-cache would not see that.
      microCache: false,
      rateLimit: 'read',
      cache: CACHE_POLICY.liveList,
      query: updatesQuery,
    },
    async ({ params, query }) => {
      if (!updatesGame(params.gameId))
        return Response.json(
          {
            error: 'Not found',
          },
          {
            status: 404,
          },
        );
      return listPatchNotes(params.gameId, query.cursor);
    },
  ),
});
