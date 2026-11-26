import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { ERROR_CODES, refusalBody } from '@/lib/errors/codes';
import { listMyDreamRiftCoopApi } from '@features/dream-rift/engine/dream-rift.contract';
import { coopMineQuery } from '@features/dream-rift/engine/coop-schema';
import { CoopCursorError, listMyCoopRuns } from '@features/dream-rift/engine/coop-runs.server';

/** GET — the caller's own finished co-op runs, newest first, 20 a page. Takes no user id, answers no other player's id. */
export const route = apiRoute('/api/dream-rift/coop/mine', {
  GET: implement(
    listMyDreamRiftCoopApi,
    // Per member, so no `cache`: the wrapper then sends no cache header and nothing stores it.
    { rateLimit: 'read', query: coopMineQuery },
    async ({ userId, query }) => {
      try {
        return await listMyCoopRuns(userId, query.cursor);
      } catch (error) {
        if (error instanceof CoopCursorError) {
          return Response.json(refusalBody('INVALID_INPUT'), { status: ERROR_CODES.INVALID_INPUT.http });
        }
        throw error;
      }
    },
  ),
});
