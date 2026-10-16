import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { createSavingsGoalSchema } from '@/lib/economy/savings-goal-schema';
import {
  createSavingsGoal,
  listSavingsGoals,
  SavingsGoalError,
} from '@/lib/economy/savings-goal.server';

/**
 * GET  /api/economy/savings-goals — the caller's goals with progress + ETA.
 * POST /api/economy/savings-goals — set a goal (a store item, a market item, or a custom amount).
 *
 * A goal never locks coins; neither route touches the ledger (C1).
 */
export const Route = createFileRoute('/api/economy/savings-goals/')({
  server: {
    handlers: {
      GET: defineHandler({ rateLimit: 'read' }, async ({ userId }) =>
        Response.json(await listSavingsGoals(userId), {
          headers: { 'Cache-Control': 'private, no-store' },
        }),
      ),
      POST: defineHandler(
        { rateLimit: 'write', body: createSavingsGoalSchema },
        async ({ userId, body }) => {
          try {
            const id = await createSavingsGoal(userId, body);
            return Response.json({ id }, { status: 201 });
          } catch (e) {
            if (e instanceof SavingsGoalError) {
              return Response.json(
                { error: e.code },
                { status: e.code === 'NOT_FOUND' ? 404 : 400 },
              );
            }
            throw e;
          }
        },
      ),
    },
  },
});
