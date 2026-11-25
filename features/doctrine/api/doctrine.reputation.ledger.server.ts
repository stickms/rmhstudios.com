import { z } from 'zod';
import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { ERROR_CODES, refusalBody } from '@/lib/errors/codes';
import { getDoctrineLedgerApi } from '@features/doctrine/engine/doctrine.contract';
import { LedgerCursorError, listLedger } from '@features/doctrine/engine/ledger.server';

/** GET: the caller's own XP ledger, newest first, 30 a page. No user id is taken; `reason` and `metadata` never leave. */
const query = z.object({
  cursor: z.string().min(1).max(200).optional(),
});

export const route = apiRoute('/api/doctrine/reputation/ledger', {
  GET: implement(getDoctrineLedgerApi, { rateLimit: 'read', query }, async ({ userId, query }) => {
    try {
      return await listLedger(userId, query.cursor);
    } catch (error) {
      if (error instanceof LedgerCursorError) {
        return Response.json(refusalBody('INVALID_INPUT'), { status: ERROR_CODES.INVALID_INPUT.http });
      }
      throw error;
    }
  }),
});
