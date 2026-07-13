import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { prisma } from '@/lib/prisma.server';
import { auth } from '@/lib/auth';
import { recordGamePlay } from '@/lib/quests/engine.server';
import { redisRateLimit } from '@/lib/redis.server';
import { rateLimit } from '@/lib/rate-limit';

const scoreSchema = z.object({
  score: z.number().int().min(0).max(10_000_000),
  puzzlesSolved: z.number().int().min(0).max(10_000),
  maxCombo: z.number().int().min(0).max(10_000),
  peakDifficulty: z.number().int().min(1).max(100),
  totalTime: z.number().finite().min(0).max(86_400),
}).strict().superRefine((value, ctx) => {
  if (value.puzzlesSolved === 0 && value.score > 0) ctx.addIssue({ code: 'custom', message: 'Score requires solved puzzles' });
  if (value.maxCombo > value.puzzlesSolved) ctx.addIssue({ code: 'custom', message: 'Combo exceeds solved puzzles' });
});

export const Route = createFileRoute('/api/games/synapse-storm/score')({ server: { handlers: {
  POST: async ({ request }) => {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const distributed = await redisRateLimit(`synapse-score:${session.user.id}`, 5, 60_000);
    const limiter = distributed ?? rateLimit(session.user.id, { limit: 2, windowMs: 60_000, prefix: 'synapse-score' });
    if (!limiter.allowed) return Response.json({ error: 'Too many requests' }, { status: 429, headers: { 'Retry-After': String(limiter.retryAfter) } });
    const parsed = scoreSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return Response.json({ error: 'Invalid score data' }, { status: 400 });
    const { score, puzzlesSolved, maxCombo, peakDifficulty, totalTime } = parsed.data;
    const existing = await prisma.synapseStormPlayer.findUnique({ where: { userId: session.user.id } });
    const player = await prisma.synapseStormPlayer.upsert({
      where: { userId: session.user.id },
      update: {
        highScore: Math.max(existing?.highScore ?? 0, score),
        puzzlesSolved: { increment: puzzlesSolved },
        maxCombo: Math.max(existing?.maxCombo ?? 0, maxCombo),
        peakDifficulty: Math.max(existing?.peakDifficulty ?? 1, peakDifficulty),
        totalTime: { increment: totalTime },
      },
      create: { userId: session.user.id, highScore: score, puzzlesSolved, maxCombo, peakDifficulty, totalTime },
    });
    await recordGamePlay(session.user.id);
    return Response.json(player);
  },
} } });
