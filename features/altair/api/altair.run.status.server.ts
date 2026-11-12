import { apiRoute } from '@/lib/api/route.server';
import { z } from 'zod';
import { apiError } from '@/lib/api/handler.server';
import { implement } from '@/lib/api/implement.server';
import * as C from '@features/altair/engine/altair.contract';
import { prisma } from '@/lib/prisma.server';

/** GET — where a submitted run is: submitted | verified (with the coins paid) | rejected | unverified. */
const query = z.object({ runId: z.string().min(8).max(64) });

export const route = apiRoute('/api/altair/run/status', {
  GET: implement(
    C.getAltairRunStatusApi,
    {
      rateLimit: { limit: 60, windowMs: 60_000, prefix: 'altair-run-status', scope: 'user' },
      query,
    },
    async ({ userId, query }) => {
      const row = await prisma.altairSoloRun.findFirst({
        where: { id: query.runId, userId },
        select: { status: true, coinsCredited: true },
      });
      if (!row) return apiError('Unknown run', 404);
      return Response.json({ status: row.status, coins: row.coinsCredited });
    },
  ),
});
