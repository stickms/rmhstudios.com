import { createFileRoute } from '@tanstack/react-router';
import { auth } from '@/lib/auth';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { buyFreeze, FREEZE_COST, MAX_FREEZE_TOKENS } from '@/lib/streak.server';

/**
 * POST /api/streak/freeze — buy one streak freeze for coins. Freezes are
 * consumed automatically by the next check-in that follows missed days.
 */
export const Route = createFileRoute('/api/streak/freeze')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const session = await auth.api.getSession({ headers: request.headers });
          if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });

          const ip = getClientIp(request);
          const { allowed } = rateLimit(ip, { limit: 10, windowMs: 60_000, prefix: 'streak-freeze' });
          if (!allowed) return Response.json({ error: 'Too many requests' }, { status: 429 });

          const result = await buyFreeze(session.user.id);
          return Response.json({ success: true, cost: FREEZE_COST, ...result });
        } catch (error) {
          if (error instanceof Error) {
            if (error.message === 'INSUFFICIENT_COINS') {
              return Response.json({ error: 'Not enough coins' }, { status: 400 });
            }
            if (error.message === 'MAX_FREEZES') {
              return Response.json(
                { error: `You already hold the maximum of ${MAX_FREEZE_TOKENS} freezes` },
                { status: 400 }
              );
            }
          }
          console.error('Streak freeze purchase error:', error);
          return Response.json({ error: 'Internal Server Error' }, { status: 500 });
        }
      },
    },
  },
});
