import { createFileRoute } from '@tanstack/react-router';
import { prisma } from '@/lib/prisma.server';
import { rateLimit, getClientIp } from '@/lib/rate-limit';

export const Route = createFileRoute('/api/neon-driftway/leaderboard')({
  server: {
    handlers: {
  GET: async ({ request }) => {
  const ip = getClientIp(request);
  const { allowed, retryAfter } = rateLimit(ip, { limit: 20, windowMs: 60_000, prefix: 'neon-driftway-leaderboard' });

  if (!allowed) {
    return Response.json({ error: 'Too many requests' }, {
      status: 429,
      headers: { 'Retry-After': String(retryAfter) },
    });
  }

  try {
    const leaderboard = await prisma.neonDriftwayPlayer.findMany({
      take: 10,
      orderBy: { highScore: 'desc' },
      select: {
        username: true,
        highScore: true,
      },
    });

    return Response.json(leaderboard);
  } catch (e) {
    console.error('Neon Driftway leaderboard fetch failed:', e);
    return Response.json({ error: 'Internal Server Error' }, { status: 500 });
  }
},
    },
  },
});
