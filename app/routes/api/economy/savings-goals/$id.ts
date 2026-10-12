import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { deleteSavingsGoal, SavingsGoalError } from '@/lib/economy/savings-goal.server';

/** DELETE /api/economy/savings-goals/:id — drop a goal. */
export const Route = createFileRoute('/api/economy/savings-goals/$id')({
  server: {
    handlers: {
      DELETE: defineHandler({ rateLimit: 'write' }, async ({ userId, params }) => {
        try {
          await deleteSavingsGoal(userId, params.id);
          return Response.json({ ok: true });
        } catch (e) {
          if (e instanceof SavingsGoalError)
            return Response.json({ error: e.code }, { status: 404 });
          throw e;
        }
      }),
    },
  },
});
