import { apiRoute } from '@/lib/api/route.server';
import { z } from 'zod';
import { apiError } from '@/lib/api/handler.server';
import { implement } from '@/lib/api/implement.server';
import * as C from '@features/altair/engine/altair.contract';
import { issueSoloRun } from '@features/altair/engine/solo/issue.server';

/**
 * POST — start a single-player run. The server picks the seed and reads the loadout from its own copy of
 * the player's upgrades; the browser plays exactly that run and submits the log to /api/altair/run/finish.
 * One open run per user (starting another closes the previous one).
 */
const body = z.object({
  classId: z.string().min(1).max(64),
  doubleTime: z.boolean().optional(),
  // Difficulty tier; the server checks the account has unlocked it.
  heat: z.number().int().min(0).max(20).optional(),
});

export const route = apiRoute('/api/altair/run/start', {
  POST: implement(
    C.startAltairRunApi,
    {
      rateLimit: { limit: 6, windowMs: 60_000, prefix: 'altair-run-start', scope: 'user' },
      body,
    },
    async ({ userId, body }) => {
      const out = await issueSoloRun(userId, body.classId, !!body.doubleTime, body.heat ?? 0);
      if (!out.ok) return apiError(out.error, 400);
      return Response.json(out.run);
    },
  ),
});
