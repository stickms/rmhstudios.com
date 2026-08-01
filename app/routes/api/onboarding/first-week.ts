import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
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
      GET: defineHandler({}, async ({ session }) => {
        const status = await getFirstWeekStatus(session.user.id);
        if (!status) return Response.json({ error: 'Not found' }, { status: 404 });
        return Response.json(status);
      }),

      POST: defineHandler(
        { rateLimit: { limit: 5, windowMs: 60_000, prefix: 'first-week-claim' } },
        async ({ session }) => {
          const result = await claimFirstWeekGraduation(session.user.id);
          return Response.json({
            result,
            graduated: result === 'graduated',
            reward: result === 'graduated' ? FIRST_WEEK_GRADUATION_REWARD : 0,
          });
        },
      ),
    },
  },
});
