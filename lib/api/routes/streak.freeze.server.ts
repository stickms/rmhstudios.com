import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { buyStreakFreezeApi } from '@/lib/today.contract';
import { buyFreeze, FREEZE_COST, MAX_FREEZE_TOKENS } from '@/lib/streak.server';

/**
 * POST /api/streak/freeze — buy one streak freeze for coins. Freezes are
 * consumed automatically by the next check-in that follows missed days.
 */
export const route = apiRoute('/api/streak/freeze', {
  POST: implement(
    buyStreakFreezeApi,
    { rateLimit: { limit: 10, windowMs: 60_000, prefix: 'streak-freeze' } },
    async ({ userId }) => {
      try {
        const result = await buyFreeze(userId);
        return { success: true as const, cost: FREEZE_COST, ...result };
      } catch (error) {
        if (error instanceof Error) {
          if (error.message === 'INSUFFICIENT_COINS') {
            return Response.json({ error: 'Not enough coins' }, { status: 400 });
          }
          if (error.message === 'MAX_FREEZES') {
            return Response.json(
              { error: `You already hold the maximum of ${MAX_FREEZE_TOKENS} freezes` },
              { status: 400 },
            );
          }
        }
        throw error;
      }
    },
  ),
});
