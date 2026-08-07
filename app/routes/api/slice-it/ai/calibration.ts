/**
 * POST /api/slice-it/ai/calibration — read a player's timing. (Feature 3.)
 *
 * Returns `{ derived, advice }`. The split is the point:
 *
 *  - `derived` is arithmetic — the pooled timing distribution and the verdict
 *    that follows from it. It is always present, with or without a provider,
 *    and it is what the "apply this offset" button acts on.
 *  - `advice` is the model's paragraph explaining it, and is null when AI is
 *    unavailable.
 *
 * A model never decides a player's calibration here. It only says out loud what
 * the numbers already concluded.
 */

import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { assertAiBudget } from '@/lib/ai/budget.server';
import { CalibrationRequestZ } from '@/lib/slice-it/ai/api-schemas';
import { deriveVerdict, explainCalibration } from '@/lib/slice-it/ai/calibration.server';
import { isAiConfigured } from '@/lib/slice-it/ai/run.server';

export const Route = createFileRoute('/api/slice-it/ai/calibration')({
  server: {
    handlers: {
      POST: defineHandler(
        {
          body: CalibrationRequestZ,
          rateLimit: {
            policy: 'ai',
            limit: 10,
            windowMs: 60_000,
            prefix: 'slice-calibration',
            scope: 'user',
          },
        },
        async ({ userId, body }) => {
          const derived = deriveVerdict(body.runs, body.currentOffsetMs);

          // The arithmetic half is free, so it is returned even when the model
          // half cannot run. A player with no provider still gets "your offset
          // looks about 22 ms out", which is the actionable part.
          if (!isAiConfigured()) return Response.json({ derived, advice: null });
          await assertAiBudget(userId);

          const advice = await explainCalibration(body.runs, body.currentOffsetMs, { userId });
          return Response.json({ derived, advice });
        },
      ),
    },
  },
});
