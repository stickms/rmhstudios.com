import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { goalActionSchema } from '@/lib/economy/community-goal';
import {
  cancelCommunityGoal,
  CommunityGoalError,
  fulfilCommunityGoal,
} from '@/lib/economy/community-goal.server';

/**
 * POST /api/community-goals/:id/admin { action: 'cancel' | 'fulfil' } — admin only.
 * `cancel` refunds every pledge through the ledger; `fulfil` marks a funded goal delivered.
 */
export const Route = createFileRoute('/api/community-goals/$id/admin')({
  server: {
    handlers: {
      POST: defineHandler(
        { auth: 'admin', rateLimit: 'write', body: goalActionSchema },
        async ({ userId, params, body }) => {
          try {
            if (body.action === 'cancel') await cancelCommunityGoal(userId, params.id);
            else await fulfilCommunityGoal(userId, params.id);
            return Response.json({ ok: true });
          } catch (e) {
            if (e instanceof CommunityGoalError) {
              return Response.json(
                { error: e.code },
                { status: e.code === 'NOT_FOUND' ? 404 : 409 },
              );
            }
            throw e;
          }
        },
      ),
    },
  },
});
