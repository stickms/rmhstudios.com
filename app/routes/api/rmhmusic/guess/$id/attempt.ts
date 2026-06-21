import { createFileRoute } from '@tanstack/react-router';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma.server';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { z } from 'zod';
import { awardXp } from '@/lib/xp/engine.server';
import { recordGamePlay } from '@/lib/quests/engine.server';
import { grantAchievement } from '@/lib/achievements/engine.server';

const schema = z.object({ guess: z.string().min(1).max(160), hintsUsed: z.number().int().min(0).max(6) });

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

/** POST /api/rmhmusic/guess/$id/attempt — check a guess and record the result. */
export const Route = createFileRoute('/api/rmhmusic/guess/$id/attempt')({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        try {
          const session = await auth.api.getSession({ headers: request.headers });
          if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });
          const userId = session.user.id;

          const ip = getClientIp(request);
          const { allowed } = rateLimit(ip, { limit: 60, windowMs: 60_000, prefix: 'music-guess' });
          if (!allowed) return Response.json({ error: 'Too many requests' }, { status: 429 });

          const body = await request.json().catch(() => ({}));
          const parsed = schema.safeParse(body);
          if (!parsed.success) return Response.json({ error: 'Invalid guess' }, { status: 400 });

          const puzzle = await prisma.musicGuessPuzzle.findUnique({
            where: { id: params.id },
            select: { id: true, title: true, acceptedAnswers: true },
          });
          if (!puzzle) return Response.json({ error: 'Not found' }, { status: 404 });

          const existing = await prisma.musicGuessAttempt.findUnique({
            where: { puzzleId_userId: { puzzleId: puzzle.id, userId } },
            select: { solved: true },
          });
          if (existing?.solved) {
            return Response.json({ correct: true, alreadySolved: true, title: puzzle.title });
          }

          const accepted = (puzzle.acceptedAnswers as string[]).map(normalize);
          const correct = accepted.includes(normalize(parsed.data.guess));

          if (!correct) return Response.json({ correct: false });

          // Solve: record attempt, bump counters, reward (fewer hints = more XP).
          const reward = Math.max(5, 30 - parsed.data.hintsUsed * 5);
          await prisma.$transaction([
            prisma.musicGuessAttempt.upsert({
              where: { puzzleId_userId: { puzzleId: puzzle.id, userId } },
              create: { puzzleId: puzzle.id, userId, solved: true, hintsUsed: parsed.data.hintsUsed },
              update: { solved: true, hintsUsed: parsed.data.hintsUsed },
            }),
            prisma.musicGuessPuzzle.update({ where: { id: puzzle.id }, data: { plays: { increment: 1 }, solves: { increment: 1 } } }),
            prisma.userProfile.upsert({ where: { userId }, create: { userId, coins: 10 + reward }, update: { coins: { increment: reward } } }),
          ]);
          await awardXp(userId, reward);
          await recordGamePlay(userId);
          await grantAchievement(userId, 'game.first_music_guess').catch(() => {});

          return Response.json({ correct: true, title: puzzle.title, reward });
        } catch (error) {
          console.error('Music guess attempt error:', error);
          return Response.json({ error: 'Internal Server Error' }, { status: 500 });
        }
      },
    },
  },
});
