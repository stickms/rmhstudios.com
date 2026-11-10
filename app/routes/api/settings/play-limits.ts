import { createFileRoute } from '@tanstack/react-router';
import { implement } from '@/lib/api/implement.server';
import { getPlayLimits, updatePlayLimits } from '@/lib/economy/play-limits.server';
import { getPlayLimitsApi, setPlayLimitsApi } from '@/lib/economy/play-limits.contract';
import { playLimitsChangeSchema } from '@/lib/economy/play-limits-schema';

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

export const Route = createFileRoute('/api/settings/play-limits')({
  server: {
    handlers: {
      GET: implement(getPlayLimitsApi, { rateLimit: 'read' }, async ({ session }) =>
        getPlayLimits(session.user.id),
      ),
      POST: implement(
        setPlayLimitsApi,
        { rateLimit: 'write', body: playLimitsChangeSchema },
        async ({ session, body }) => updatePlayLimits(session.user.id, body),
      ),
    },
  },
});
