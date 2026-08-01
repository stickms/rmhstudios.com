import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { getStreak, checkIn } from '@/lib/streak.server';

/**
 * GET  /api/streak — the current user's streak state.
 * POST /api/streak — perform today's check-in (idempotent per day).
 */
export const Route = createFileRoute('/api/streak')({
  server: {
    handlers: {
      GET: defineHandler({}, async ({ session }) => {
        return Response.json(await getStreak(session.user.id));
      }),
      POST: defineHandler(
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
    },
  },
});
