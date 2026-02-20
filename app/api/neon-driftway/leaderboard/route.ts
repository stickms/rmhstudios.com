import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { rateLimit, getClientIp } from '@/lib/rate-limit';

export async function GET(req: Request) {
  const ip = getClientIp(req);
  const { allowed, retryAfter } = rateLimit(ip, { limit: 20, windowMs: 60_000, prefix: 'neon-driftway-leaderboard' });

  if (!allowed) {
    return NextResponse.json({ error: 'Too many requests' }, {
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

    return NextResponse.json(leaderboard);
  } catch (e) {
    console.error('Neon Driftway leaderboard fetch failed:', e);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
