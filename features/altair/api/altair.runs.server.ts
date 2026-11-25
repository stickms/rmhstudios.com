import { apiRoute } from '@/lib/api/route.server';
import { z } from 'zod';
import { implement } from '@/lib/api/implement.server';
import { ERROR_CODES, refusalBody } from '@/lib/errors/codes';
import * as C from '@features/altair/engine/altair.contract';
import { RunsCursorError, listCoopMatches, listSoloRuns } from '@features/altair/engine/runs.server';
import { getCoopRecord } from '@features/altair/engine/coop-record.server';

/**
 * GET — the caller's own finished solo runs or co-op matches, newest first, 20 a page. No user id is taken. The first
 * co-op page also carries `coopRecord`.
 */
const query = z.object({
  kind: z.enum(['solo', 'coop']),
  cursor: z.string().min(1).max(200).optional(),
});

export const route = apiRoute('/api/altair/runs', {
  GET: implement(C.getAltairRunsApi, { rateLimit: 'read', query }, async ({ userId, query }) => {
    try {
      if (query.kind === 'solo') return await listSoloRuns(userId, query.cursor);
      const page = await listCoopMatches(userId, query.cursor);
      // The record rides on the first co-op page only (null with no co-op profile); later pages and solo omit it.
      return query.cursor ? page : { ...page, coopRecord: await getCoopRecord(userId) };
    } catch (error) {
      if (error instanceof RunsCursorError) {
        return Response.json(refusalBody('INVALID_INPUT'), { status: ERROR_CODES.INVALID_INPUT.http });
      }
      throw error;
    }
  }),
});
