import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { defineHandler, apiError } from '@/lib/api/handler.server';
import { issueSoloRun } from '@/lib/altair/solo/issue.server';

/**
 * POST — start a single-player run. The server picks the seed and reads the loadout from its own copy of
 * the player's upgrades; the browser plays exactly that run and submits the log to /api/altair/run/finish.
 * One open run per user (starting another closes the previous one).
 */
const body = z.object({
  classId: z.string().min(1).max(64),
  doubleTime: z.boolean().optional(),
});

export const Route = createFileRoute('/api/altair/run/start')({
  server: {
    handlers: {
      POST: defineHandler(
        { rateLimit: { limit: 6, windowMs: 60_000, prefix: 'altair-run-start', scope: 'user' }, body },
        async ({ userId, body }) => {
          const out = await issueSoloRun(userId, body.classId, !!body.doubleTime);
          if (!out.ok) return apiError(out.error, 400);
          return Response.json(out.run);
        },
      ),
    },
  },
});
