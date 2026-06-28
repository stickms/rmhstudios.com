import { createFileRoute } from '@tanstack/react-router';
import { prisma } from '@/lib/prisma.server';
import { auth } from '@/lib/auth';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { recordGamePlay } from '@/lib/quests/engine.server';

const DIFFICULTY_FIELDS = {
  easy: 'highScoreEasy',
  normal: 'highScoreNormal',
  hard: 'highScoreHard',
  lunatic: 'highScoreLunatic',
} as const;

type Difficulty = keyof typeof DIFFICULTY_FIELDS;
type ScoreField = (typeof DIFFICULTY_FIELDS)[Difficulty];

/**
 * Pick a leaderboard display name from the user's handle/name (the `username`
 * column is unique), guaranteeing uniqueness by falling back to a user-id
 * suffix if the preferred name is already taken.
 */
async function deriveUniqueUsername(handle: string | null | undefined, name: string | null | undefined, userId: string): Promise<string> {
  const clean = (s: string | null | undefined) => (s ?? '').trim().replace(/[^a-zA-Z0-9_\-. ]/g, '').slice(0, 24);
  const base = clean(handle) || clean(name) || 'Dreamer';
  const candidate = base.length >= 2 ? base : 'Dreamer';
  const existing = await prisma.dreamRiftPlayer.findUnique({ where: { username: candidate }, select: { id: true } });
  if (!existing) return candidate;
  // Name taken by someone else — append a short, stable id fragment.
  const suffix = `-${userId.slice(0, 6)}`;
  return `${candidate.slice(0, 24 - suffix.length)}${suffix}`;
}

export const Route = createFileRoute('/api/dream-rift/score')({
  server: {
    handlers: {
  POST: async ({ request }) => {
  const ip = getClientIp(request);
  const { allowed, retryAfter } = rateLimit(ip, { limit: 5, windowMs: 60_000, prefix: 'dream-rift-score' });
  if (!allowed) {
    return Response.json({ error: 'Too many requests' }, {
      status: 429,
      headers: { 'Retry-After': String(retryAfter) },
    });
  }

  try {
    const { score, difficulty, stage, character, graze, spellsCaptured } = await request.json();

    if (typeof score !== 'number' || score < 0 || score > 10_000_000) {
      return Response.json({ error: 'Invalid score' }, { status: 400 });
    }

    // Scores are tied to the signed-in account — guests cannot post.
    const session = await auth.api.getSession({ headers: request.headers });
    const userId = session?.user?.id;
    if (!userId) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
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
        },
      });
      await recordGamePlay(userId);
      return Response.json({ success: true, linked: true });
    }

    // First submission for this account: derive a unique display name from the
    // user's handle/name (the leaderboard otherwise renders the linked account).
    const account = await prisma.user.findUnique({ where: { id: userId }, select: { handle: true, name: true } });
    const username = await deriveUniqueUsername(account?.handle, account?.name, userId);

    await prisma.dreamRiftPlayer.create({
      data: {
        userId,
        username,
        [scoreField]: Math.round(score),
        bestStage: safeStage,
        character: safeCharacter,
        gamesPlayed: 1,
        totalGraze: safeGraze,
        spellsCaptured: safeSpells,
      },
    });
    await recordGamePlay(userId);
    return Response.json({ success: true, created: true });
  } catch (e) {
    console.error('Failed to submit dream-rift score:', e);
    return Response.json({ error: 'Internal Server Error' }, { status: 500 });
  }
},
    },
  },
});
