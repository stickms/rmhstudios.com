import { apiRoute } from '@/lib/api/route.server';
import { z } from 'zod';
import { implement } from '@/lib/api/implement.server';
import { ERROR_CODES, refusalBody } from '@/lib/errors/codes';
import { getSynapseStormMatchesApi } from '@features/synapse-storm/engine/matches.contract';
import { resolveRivalKey } from '@features/synapse-storm/engine/rivals.server';
import { RIVAL_KEY_MAX } from '@features/synapse-storm/engine/rivals';
import { MatchesCursorError, listMyMatches } from '@features/synapse-storm/engine/matches.server';

/** GET — the caller's own finished versus matches, newest first, 20 a page; `with=<rival key>` keeps a pair's. */
const query = z.object({
  cursor: z.string().min(1).max(200).optional(),
  with: z.string().min(1).max(RIVAL_KEY_MAX).optional(),
});

export const route = apiRoute('/api/games/synapse-storm/matches', {
  GET: implement(getSynapseStormMatchesApi, { rateLimit: 'read', query }, async ({ userId, query }) => {
    try {
      let rivalUserId: string | undefined;
      if (query.with) {
        // The key must name another listable player of a match the caller sat in, else it is not found.
        rivalUserId = (await resolveRivalKey(userId, query.with)) ?? undefined;
        if (!rivalUserId) return Response.json(refusalBody('NOT_FOUND'), { status: ERROR_CODES.NOT_FOUND.http });
      }
      return await listMyMatches(userId, query.cursor, rivalUserId);
    } catch (error) {
      if (error instanceof MatchesCursorError) {
        return Response.json(refusalBody('INVALID_INPUT'), { status: ERROR_CODES.INVALID_INPUT.http });
      }
      throw error;
    }
  }),
});
