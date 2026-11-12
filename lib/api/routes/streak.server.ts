import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { checkInStreakApi, getStreakApi } from '@/lib/streak.contract';
import { getStreak, checkIn } from '@/lib/streak.server';

/**
 * GET  /api/streak — the current user's streak state.
 * POST /api/streak — perform today's check-in (idempotent per day).
 */
export const route = apiRoute('/api/streak', {
  GET: implement(getStreakApi, {}, async ({ session }) => {
    return Response.json(await getStreak(session.user.id));
  }),
  POST: implement(
    checkInStreakApi,
    { rateLimit: { limit: 20, windowMs: 60_000, prefix: 'streak-checkin' } },
    async ({ session }) => {
      try {
        return Response.json(await checkIn(session.user.id));
      } catch (error) {
        console.error('Streak check-in error:', error);
        return Response.json({ error: 'Internal Server Error' }, { status: 500 });
      }
    },
  ),
});
