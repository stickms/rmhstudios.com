import { apiRoute } from '@/lib/api/route.server';
import { z } from 'zod';
import { implement } from '@/lib/api/implement.server';
import * as C from '@features/slice-it/engine/slice-it.contract';
import { submitDailyEntry } from '@features/slice-it/engine/daily.server';

/**
 * S1 — spend the day's one ranked attempt.
 *
 * Separate from `/api/slice-it/score` on purpose. That route owns the
 * leaderboard, the run token, the integrity pass and the personal-best upsert,
 * and a daily attempt still goes through it — this is the *additional* write
 * that files the attempt on the daily board and burns the day. Folding the two
 * together would mean editing the score route, which is the most
 * correctness-sensitive endpoint in the game, to add a mode it does not need to
 * know about.
 *
 * The one-attempt rule is not enforced here. It is enforced by
 * `@@unique([dayKey, userId])`; this handler only translates the resulting
 * P2002 into a 409. A guard in this file would be a guard two tabs can walk
 * past.
 */
const DailySubmitZ = z.object({
  songId: z.string().min(1).max(64),
  score: z.number().int().min(0).max(50_000_000),
  accuracy: z.number().min(0).max(100),
  maxCombo: z.number().int().min(0).max(1_000_000),
  cleared: z.boolean(),
});

export const route = apiRoute('/api/slice-it/daily/submit', {
  POST: implement(
    C.submitDailyApi,
    { rateLimit: { limit: 10, windowMs: 60_000, prefix: 'slice-daily' }, body: DailySubmitZ },
    async ({ userId, body }) => {
      const result = await submitDailyEntry(userId, body);
      if (!result.ok) {
        const status = result.reason === 'already-played' ? 409 : 400;
        return Response.json({ error: result.reason }, { status });
      }
      return Response.json(result);
    },
  ),
});
