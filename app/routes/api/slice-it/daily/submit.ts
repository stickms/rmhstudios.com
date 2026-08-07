import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { defineHandler } from '@/lib/api/handler.server';
import { submitDailyEntry } from '@/lib/slice-it/daily.server';

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

export const Route = createFileRoute('/api/slice-it/daily/submit')({
  server: {
    handlers: {
      POST: defineHandler(
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
    },
  },
});
