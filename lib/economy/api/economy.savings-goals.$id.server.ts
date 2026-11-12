import { apiRoute } from '@/lib/api/route.server';
import { defineHandler } from '@/lib/api/handler.server';
import { deleteSavingsGoal, SavingsGoalError } from '@/lib/economy/savings-goal.server';

/** DELETE /api/economy/savings-goals/:id — drop a goal. */
export const route = apiRoute('/api/economy/savings-goals/$id', {
  DELETE: defineHandler({ rateLimit: 'write' }, async ({ userId, params }) => {
    try {
      await deleteSavingsGoal(userId, params.id);
      return Response.json({ ok: true });
    } catch (e) {
      if (e instanceof SavingsGoalError) return Response.json({ error: e.code }, { status: 404 });
      throw e;
    }
  }),
});
