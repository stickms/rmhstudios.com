import { apiRoute } from '@/lib/api/route.server';
import { z } from 'zod';
import { implement } from '@/lib/api/implement.server';
import { ERROR_CODES, refusalBody } from '@/lib/errors/codes';
import * as C from '@features/altair/engine/altair.contract';
import { RunsCursorError, listCoopMatches, listSoloRuns } from '@features/altair/engine/runs.server';

/** GET — the caller's own finished solo runs or co-op matches, newest first, 20 a page. No user id is taken. */
const query = z.object({
  kind: z.enum(['solo', 'coop']),
  cursor: z.string().min(1).max(200).optional(),
});

export const route = apiRoute('/api/altair/runs', {
  GET: implement(C.getAltairRunsApi, { rateLimit: 'read', query }, async ({ userId, query }) => {
    try {
      return query.kind === 'solo'
        ? await listSoloRuns(userId, query.cursor)
        : await listCoopMatches(userId, query.cursor);
    } catch (error) {
      if (error instanceof RunsCursorError) {
        return Response.json(refusalBody('INVALID_INPUT'), { status: ERROR_CODES.INVALID_INPUT.http });
      }
      throw error;
    }
  }),
});
