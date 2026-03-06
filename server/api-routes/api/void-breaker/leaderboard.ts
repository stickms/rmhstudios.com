import { createAPIFileRoute } from "@tanstack/react-start/api";
import { prisma } from '@/lib/prisma';
import { rateLimit, getClientIp } from '@/lib/rate-limit';

export const APIRoute = createAPIFileRoute("/api/void-breaker/leaderboard")({
  GET: async ({ request }) => {
  const ip = getClientIp(request);
  const { allowed, retryAfter } = rateLimit(ip, { limit: 20, windowMs: 60_000, prefix: 'void-breaker-leaderboard' });
  if (!allowed) {
    return Response.json({ error: 'Too many requests' }, {
      status: 429,
      headers: { 'Retry-After': String(retryAfter) },
    });
  }

  try {
    const leaderboard = await prisma.voidBreakerPlayer.findMany({
      take: 10,
      orderBy: { highScore: 'desc' },
      select: { username: true, highScore: true },
    });
    return Response.json(leaderboard);
  } catch (e) {
    console.error('Void Breaker leaderboard fetch failed:', e);
    return Response.json({ error: 'Internal Server Error' }, { status: 500 });
  }
},
});
