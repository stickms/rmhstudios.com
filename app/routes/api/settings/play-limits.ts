import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { defineHandler } from '@/lib/api/handler.server';
import { getPlayLimits, updatePlayLimits } from '@/lib/economy/play-limits.server';
import {
  MAX_COOL_OFF_DAYS,
  MAX_DAILY_CAP,
  MAX_EXCLUSION_DAYS,
} from '@/lib/economy/play-limits';

/**
 * `/api/settings/play-limits` — the member's own guard rails (W8).
 *
 * GET returns the current limits plus what has been staked today, so the panel
 * can show headroom rather than just a number.
 *
 * POST applies a change. The asymmetry that makes the feature worth anything —
 * tightening now, loosening after 24 hours, self-exclusion extendable only —
 * lives in `applyChange` (`lib/economy/play-limits.ts`) and is deliberately not
 * re-stated here: this route validates shape, not policy.
 *
 * Note the absence of a DELETE. There is no "clear my limits" verb, because
 * every way to loosen has to go through the same delay, and a separate verb is
 * exactly the shortcut a member asked us not to offer them.
 */

const schema = z
  .object({
    /** `null` removes the cap (a loosening, so it waits). Omit to leave alone. */
    dailyCoinCap: z.number().int().min(1).max(MAX_DAILY_CAP).nullable().optional(),
    excludeForDays: z.number().int().min(1).max(MAX_EXCLUSION_DAYS).optional(),
    coolOffForDays: z.number().int().min(1).max(MAX_COOL_OFF_DAYS).optional(),
  })
  .refine(
    (v) =>
      v.dailyCoinCap !== undefined ||
      v.excludeForDays !== undefined ||
      v.coolOffForDays !== undefined,
    { message: 'Nothing to change' },
  );

export const Route = createFileRoute('/api/settings/play-limits')({
  server: {
    handlers: {
      GET: defineHandler({ rateLimit: 'read' }, async ({ session }) =>
        Response.json(await getPlayLimits(session.user.id)),
      ),
      POST: defineHandler(
        { rateLimit: 'write', body: schema },
        async ({ session, body }) =>
          Response.json(await updatePlayLimits(session.user.id, body)),
      ),
    },
  },
});
