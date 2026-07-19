import { createFileRoute } from '@tanstack/react-router';
import { auth } from '@/lib/auth';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import {
  getFirstWeekStatus,
  claimFirstWeekGraduation,
  FIRST_WEEK_GRADUATION_REWARD,
} from '@/lib/onboarding.server';

/**
 * GET  /api/onboarding/first-week — the caller's First Week arc progress
 *      (server-verified; lazily grants any just-completed step's coins).
 * POST /api/onboarding/first-week — claim the graduation reward once every step
 *      is done (coin bonus + starter cosmetic pack).
 */
export const Route = createFileRoute('/api/onboarding/first-week')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const session = await auth.api.getSession({ headers: request.headers });
          if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });

          const status = await getFirstWeekStatus(session.user.id);
          if (!status) return Response.json({ error: 'Not found' }, { status: 404 });
          return Response.json(status);
        } catch (error) {
          console.error('First-week status error:', error);
          return Response.json({ error: 'Internal Server Error' }, { status: 500 });
        }
      },

      POST: async ({ request }) => {
        try {
          const session = await auth.api.getSession({ headers: request.headers });
          if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });

          const { allowed, retryAfter } = rateLimit(getClientIp(request), {
            limit: 5,
            windowMs: 60_000,
            prefix: 'first-week-claim',
          });
          if (!allowed) {
            return Response.json(
              { error: 'Too many requests' },
              { status: 429, headers: { 'Retry-After': String(retryAfter) } },
            );
          }

          const result = await claimFirstWeekGraduation(session.user.id);
          return Response.json({
            result,
            graduated: result === 'graduated',
            reward: result === 'graduated' ? FIRST_WEEK_GRADUATION_REWARD : 0,
          });
        } catch (error) {
          console.error('First-week claim error:', error);
          return Response.json({ error: 'Internal Server Error' }, { status: 500 });
        }
      },
    },
  },
});
