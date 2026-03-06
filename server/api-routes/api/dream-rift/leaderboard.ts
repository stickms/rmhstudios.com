import { createAPIFileRoute } from "@tanstack/react-start/api";
import { prisma } from '@/lib/prisma';
import { rateLimit, getClientIp } from '@/lib/rate-limit';

const DIFFICULTY_FIELDS = {
  easy: 'highScoreEasy',
  normal: 'highScoreNormal',
  hard: 'highScoreHard',
  lunatic: 'highScoreLunatic',
} as const;

type Difficulty = keyof typeof DIFFICULTY_FIELDS;

export const APIRoute = createAPIFileRoute("/api/dream-rift/leaderboard")({
  GET: async ({ request }) => {
  const ip = getClientIp(request);
  const { allowed, retryAfter } = rateLimit(ip, { limit: 20, windowMs: 60_000, prefix: 'dream-rift-leaderboard' });

  if (!allowed) {
    return Response.json({ error: 'Too many requests' }, {
      status: 429,
      headers: { 'Retry-After': String(retryAfter) },
    });
  }

  try {
    const { searchParams } = new URL(request.url);
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

    return Response.json(leaderboard);
  } catch (e) {
    console.error('Dream Rift leaderboard fetch failed:', e);
    return Response.json({ error: 'Internal Server Error' }, { status: 500 });
  }
},
});
