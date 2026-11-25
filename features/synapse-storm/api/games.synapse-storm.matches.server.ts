import { apiRoute } from '@/lib/api/route.server';
import { z } from 'zod';
import { implement } from '@/lib/api/implement.server';
import { ERROR_CODES, refusalBody } from '@/lib/errors/codes';
import { getSynapseStormMatchesApi } from '@features/synapse-storm/engine/matches.contract';
import { MatchesCursorError, listMyMatches } from '@features/synapse-storm/engine/matches.server';

/** GET — the caller's own finished versus matches, newest first, 20 a page. No user id is taken. */
const query = z.object({
  cursor: z.string().min(1).max(200).optional(),
});

export const route = apiRoute('/api/games/synapse-storm/matches', {
  GET: implement(getSynapseStormMatchesApi, { rateLimit: 'read', query }, async ({ userId, query }) => {
    try {
      return await listMyMatches(userId, query.cursor);
    } catch (error) {
      if (error instanceof MatchesCursorError) {
        return Response.json(refusalBody('INVALID_INPUT'), { status: ERROR_CODES.INVALID_INPUT.http });
      }
      throw error;
    }
  }),
});
