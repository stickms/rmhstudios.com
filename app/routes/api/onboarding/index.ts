import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import {
  getOnboardingStatus,
  claimOnboardingReward,
  ONBOARDING_REWARD,
} from '@/lib/onboarding.server';

/**
 * GET  /api/onboarding — the caller's checklist progress (server-verified).
 * POST /api/onboarding — claim the completion reward once every step is done.
 */
export const Route = createFileRoute('/api/onboarding/')({
  server: {
    handlers: {
      GET: defineHandler({}, async ({ session }) => {
        const status = await getOnboardingStatus(session.user.id);
        if (!status) {
          return Response.json({ error: 'Not found' }, { status: 404 });
        }
        return Response.json({ ...status, reward: ONBOARDING_REWARD });
      }),

      POST: defineHandler(
        { rateLimit: { limit: 5, windowMs: 60_000, prefix: 'onboarding-claim' } },
        async ({ session }) => {
          const result = await claimOnboardingReward(session.user.id);
          return Response.json({
            result,
            claimed: result === 'claimed',
            reward: result === 'claimed' ? ONBOARDING_REWARD : 0,
          });
        },
      ),
    },
  },
});
