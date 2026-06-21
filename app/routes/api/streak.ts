import { createFileRoute } from '@tanstack/react-router';
import { auth } from '@/lib/auth';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { getStreak, checkIn } from '@/lib/streak.server';

/**
 * GET  /api/streak — the current user's streak state.
 * POST /api/streak — perform today's check-in (idempotent per day).
 */
export const Route = createFileRoute('/api/streak')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const session = await auth.api.getSession({ headers: request.headers });
        if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });
        return Response.json(await getStreak(session.user.id));
      },
      POST: async ({ request }) => {
        const session = await auth.api.getSession({ headers: request.headers });
        if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });

        const ip = getClientIp(request);
        const { allowed } = rateLimit(ip, { limit: 20, windowMs: 60_000, prefix: 'streak-checkin' });
        if (!allowed) return Response.json({ error: 'Too many requests' }, { status: 429 });

        try {
          return Response.json(await checkIn(session.user.id));
        } catch (error) {
          console.error('Streak check-in error:', error);
          return Response.json({ error: 'Internal Server Error' }, { status: 500 });
        }
      },
    },
  },
});
