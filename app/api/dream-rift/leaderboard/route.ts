import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { rateLimit, getClientIp } from '@/lib/rate-limit';

const DIFFICULTY_FIELDS = {
  easy: 'highScoreEasy',
  normal: 'highScoreNormal',
  hard: 'highScoreHard',
  lunatic: 'highScoreLunatic',
} as const;

type Difficulty = keyof typeof DIFFICULTY_FIELDS;

export async function GET(req: Request) {
  const ip = getClientIp(req);
  const { allowed, retryAfter } = rateLimit(ip, { limit: 20, windowMs: 60_000, prefix: 'dream-rift-leaderboard' });

  if (!allowed) {
    return NextResponse.json({ error: 'Too many requests' }, {
      status: 429,
      headers: { 'Retry-After': String(retryAfter) },
    });
  }

  try {
    const { searchParams } = new URL(req.url);
    const difficultyParam = (searchParams.get('difficulty') || 'normal').toLowerCase();
    const difficulty: Difficulty = (difficultyParam in DIFFICULTY_FIELDS)
      ? (difficultyParam as Difficulty)
      : 'normal';
    const scoreField = DIFFICULTY_FIELDS[difficulty];

    const leaderboard = await prisma.dreamRiftPlayer.findMany({
      take: 20,
      orderBy: { [scoreField]: 'desc' },
      select: {
        username: true,
        [scoreField]: true,
        bestStage: true,
        character: true,
        spellsCaptured: true,
      },
    });

    return NextResponse.json(leaderboard);
  } catch (e) {
    console.error('Dream Rift leaderboard fetch failed:', e);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
