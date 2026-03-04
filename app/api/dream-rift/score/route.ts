import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from '@/lib/auth';
import { headers } from 'next/headers';
import { rateLimit, getClientIp } from '@/lib/rate-limit';

const DIFFICULTY_FIELDS = {
  easy: 'highScoreEasy',
  normal: 'highScoreNormal',
  hard: 'highScoreHard',
  lunatic: 'highScoreLunatic',
} as const;

type Difficulty = keyof typeof DIFFICULTY_FIELDS;
type ScoreField = (typeof DIFFICULTY_FIELDS)[Difficulty];

export async function POST(req: Request) {
  const ip = getClientIp(req);
  const { allowed, retryAfter } = rateLimit(ip, { limit: 5, windowMs: 60_000, prefix: 'dream-rift-score' });
  if (!allowed) {
    return NextResponse.json({ error: 'Too many requests' }, {
      status: 429,
      headers: { 'Retry-After': String(retryAfter) },
    });
  }

  try {
    const { username, score, difficulty, stage, character, graze, spellsCaptured } = await req.json();

    if (!username || typeof username !== 'string') {
      return NextResponse.json({ error: 'Invalid username' }, { status: 400 });
    }
    const cleanUsername = username.trim().replace(/[^a-zA-Z0-9_\-. ]/g, '').slice(0, 24);
    if (cleanUsername.length < 2) {
      return NextResponse.json({ error: 'Invalid username' }, { status: 400 });
    }
    if (typeof score !== 'number' || score < 0 || score > 10_000_000) {
      return NextResponse.json({ error: 'Invalid score' }, { status: 400 });
    }

    const session = await auth.api.getSession({ headers: await headers() });
    const userId = session?.user?.id;

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const difficultyKey: Difficulty = (typeof difficulty === 'string' && difficulty.toLowerCase() in DIFFICULTY_FIELDS)
      ? (difficulty.toLowerCase() as Difficulty)
      : 'normal';
    const scoreField: ScoreField = DIFFICULTY_FIELDS[difficultyKey];

    const safeStage = typeof stage === 'number' && stage >= 1 ? Math.round(stage) : 1;
    const safeCharacter = typeof character === 'string' ? character.slice(0, 32) : 'rei';
    const safeGraze = typeof graze === 'number' && graze >= 0 ? Math.round(graze) : 0;
    const safeSpells = typeof spellsCaptured === 'number' && spellsCaptured >= 0 ? Math.round(spellsCaptured) : 0;

    const existingProfile = await prisma.dreamRiftPlayer.findUnique({
      where: { userId },
    });

    if (existingProfile) {
      await prisma.dreamRiftPlayer.update({
        where: { id: existingProfile.id },
        data: {
          [scoreField]: Math.max(existingProfile[scoreField] as number, Math.round(score)),
          bestStage: Math.max(existingProfile.bestStage, safeStage),
          character: safeCharacter,
          gamesPlayed: { increment: 1 },
          totalGraze: { increment: safeGraze },
          spellsCaptured: { increment: safeSpells },
          updatedAt: new Date(),
          username: cleanUsername,
        },
      });
      return NextResponse.json({ success: true, linked: true });
    }

    const usernameConflict = await prisma.dreamRiftPlayer.findUnique({
      where: { username: cleanUsername },
    });
    if (usernameConflict) {
      return NextResponse.json({ error: 'Username already taken.' }, { status: 409 });
    }

    await prisma.dreamRiftPlayer.create({
      data: {
        userId,
        username: cleanUsername,
        [scoreField]: Math.round(score),
        bestStage: safeStage,
        character: safeCharacter,
        gamesPlayed: 1,
        totalGraze: safeGraze,
        spellsCaptured: safeSpells,
      },
    });
    return NextResponse.json({ success: true, created: true });
  } catch (e) {
    console.error('Failed to submit dream-rift score:', e);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
