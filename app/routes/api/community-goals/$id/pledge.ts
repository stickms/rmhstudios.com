import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { pledgeSchema } from '@/lib/economy/community-goal';
import { CommunityGoalError, pledgeToGoal } from '@/lib/economy/community-goal.server';

/**
 * POST /api/community-goals/:id/pledge { coins } — escrow coins toward a goal (C5).
 *
 * `idempotent: true` because a pledge is legitimately repeatable (pledging twice
 * is a real intent), so the ledger cannot dedupe it from its arguments; the
 * request-level `Idempotency-Key` is what makes a retried POST replay instead of
 * escrowing a second time.
 */
export const Route = createFileRoute('/api/community-goals/$id/pledge')({
  server: {
    handlers: {
      POST: defineHandler(
        {
          rateLimit: { limit: 20, windowMs: 60_000, prefix: 'cgoal-pledge', scope: 'user' },
          body: pledgeSchema,
          idempotent: true,
        },
        async ({ userId, params, body }) => {
          try {
            return Response.json({
              ok: true,
              ...(await pledgeToGoal(params.id, userId, body.coins)),
            });
          } catch (e) {
            if (e instanceof CommunityGoalError) {
              return Response.json(
                { error: e.code, ...(e.detail !== undefined ? { remaining: e.detail } : {}) },
                { status: e.code === 'NOT_FOUND' ? 404 : e.code === 'GOAL_CHANGED' ? 409 : 400 },
              );
            }
            throw e;
          }
        },
      ),
    },
  },
});
