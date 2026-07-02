import { createFileRoute } from '@tanstack/react-router';
import { auth } from '@/lib/auth';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
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
      GET: async ({ request }) => {
        try {
          const session = await auth.api.getSession({ headers: request.headers });
          if (!session) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
          }
          const status = await getOnboardingStatus(session.user.id);
          if (!status) {
            return Response.json({ error: 'Not found' }, { status: 404 });
          }
          return Response.json({ ...status, reward: ONBOARDING_REWARD });
        } catch (error) {
          console.error('Onboarding status error:', error);
          return Response.json({ error: 'Internal Server Error' }, { status: 500 });
        }
      },

      POST: async ({ request }) => {
        try {
          const session = await auth.api.getSession({ headers: request.headers });
          if (!session) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
          }
          const { allowed, retryAfter } = rateLimit(getClientIp(request), {
            limit: 5,
            windowMs: 60_000,
            prefix: 'onboarding-claim',
          });
          if (!allowed) {
            return Response.json(
              { error: 'Too many requests' },
              { status: 429, headers: { 'Retry-After': String(retryAfter) } }
            );
          }
          const result = await claimOnboardingReward(session.user.id);
          return Response.json({
            result,
            claimed: result === 'claimed',
            reward: result === 'claimed' ? ONBOARDING_REWARD : 0,
          });
        } catch (error) {
          console.error('Onboarding claim error:', error);
          return Response.json({ error: 'Internal Server Error' }, { status: 500 });
        }
      },
    },
  },
});
