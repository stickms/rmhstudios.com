import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { setWeeklyGoalApi } from '@/lib/rmhstudy/history.contract';
import { goalBody } from '@/lib/rmhstudy/history-schema';
import { setWeeklyGoal } from '@/lib/rmhstudy/history.server';

/** PUT /api/rmhstudy/goal — set (30 to 3,000 minutes) or clear (null) the member's weekly goal. */
export const route = apiRoute('/api/rmhstudy/goal', {
  PUT: implement(
    setWeeklyGoalApi,
    {
      rateLimit: 'write',
      body: goalBody,
    },
    async ({ userId, body }) => ({
      goalMinutes: await setWeeklyGoal(userId, body.minutes),
    }),
  ),
});
