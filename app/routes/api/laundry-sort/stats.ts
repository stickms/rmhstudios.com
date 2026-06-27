import { createFileRoute } from '@tanstack/react-router';
import { prisma } from '@/lib/prisma.server';
import { auth } from '@/lib/auth';
import { rateLimit, getClientIp } from '@/lib/rate-limit';

/** The signed-in player's career stats for the profile panel. */
export const Route = createFileRoute('/api/laundry-sort/stats')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const ip = getClientIp(request);
        const { allowed, retryAfter } = rateLimit(ip, { limit: 40, windowMs: 60_000, prefix: 'laundry-stats' });
        if (!allowed) {
          return Response.json({ error: 'Too many requests' }, { status: 429, headers: { 'Retry-After': String(retryAfter) } });
        }
        try {
          const session = await auth.api.getSession({ headers: request.headers });
          const userId = session?.user?.id;
          if (!userId) return Response.json({ error: 'Unauthorized' }, { status: 401 });

          const player = await prisma.laundryPlayer.findUnique({
            where: { userId },
            select: {
              username: true,
              highScore: true,
              bestStreak: true,
              totalSorted: true,
              totalMissed: true,
              gamesPlayed: true,
              rankedWins: true,
              rankedPlayed: true,
            },
          });
          if (!player) {
            return Response.json({
              username: null,
              highScore: 0,
              bestStreak: 0,
              totalSorted: 0,
              totalMissed: 0,
              gamesPlayed: 0,
              rankedWins: 0,
              rankedPlayed: 0,
              accuracy: 1,
            });
          }
          const total = player.totalSorted + player.totalMissed;
          return Response.json({ ...player, accuracy: total === 0 ? 1 : player.totalSorted / total });
        } catch (e) {
          console.error('Laundry stats fetch failed:', e);
          return Response.json({ error: 'Internal Server Error' }, { status: 500 });
        }
      },
    },
  },
});
