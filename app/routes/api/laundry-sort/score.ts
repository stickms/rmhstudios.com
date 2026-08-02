import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma.server';
import { auth } from '@/lib/auth';
import { recordGamePlay } from '@/lib/quests/engine.server';
import { reportGameResult } from '@/lib/game/results.server';
import {
  MATCH_DURATIONS,
  DIFFICULTIES,
  SCORE,
  comboMultiplier,
} from '@/lib/laundry-sort/constants';

/**
 * Submit a **solo** Laundry Sort run.
 *
 * Versus results never come through here — the socket hub writes those itself
 * when a race ends, from reports it has already reconciled across the room.
 *
 * The cloth simulation runs on the client, so the score arrives untrusted. A
 * full server-side replay is not worth its cost for an arcade board, but a
 * score has to be *reachable*: it is bounded below by the reported sort count
 * and the best possible combo multiplier, and above by what the match length
 * physically allows. That closes the "POST a million" hole without pretending
 * to be an authoritative simulation.
 */

const bodySchema = z.object({
  score: z.number().int().min(0).max(1_000_000),
  sorted: z.number().int().min(0).max(10_000),
  wrong: z.number().int().min(0).max(10_000),
  missed: z.number().int().min(0).max(10_000),
  bestCombo: z.number().int().min(0).max(10_000),
  durationSec: z
    .number()
    .int()
    .refine((d): d is (typeof MATCH_DURATIONS)[number] =>
      (MATCH_DURATIONS as readonly number[]).includes(d),
    ),
  difficulty: z.enum(DIFFICULTIES),
});

/** The most a run of `sorted` correct garments could possibly be worth. */
function scoreCeiling(sorted: number): number {
  return Math.round(sorted * SCORE.correct * comboMultiplier(SCORE.maxComboSteps));
}

export const Route = createFileRoute('/api/laundry-sort/score')({
  server: {
    handlers: {
      POST: defineHandler(
        { auth: 'none', rateLimit: { limit: 10, windowMs: 60_000, prefix: 'laundry-score' } },
        async ({ request }) => {
          try {
            const session = await auth.api.getSession({ headers: request.headers });
            if (!session?.user?.id) {
              return Response.json({ error: 'Unauthorized' }, { status: 401 });
            }
            const userId = session.user.id;

            const body = await request.json().catch(() => ({}));
            const parsed = bodySchema.safeParse(body);
            if (!parsed.success) {
              return Response.json({ error: 'Invalid input' }, { status: 400 });
            }
            const { score, sorted, bestCombo } = parsed.data;

            if (score > scoreCeiling(sorted) || bestCombo > sorted) {
              return Response.json({ error: 'Implausible result' }, { status: 400 });
            }

            const existing = await prisma.laundryPlayer.findUnique({ where: { userId } });

            if (existing) {
              const personalBest = score > existing.highScore;
              await prisma.laundryPlayer.update({
                where: { id: existing.id },
                data: {
                  highScore: Math.max(existing.highScore, score),
                  bestCombo: Math.max(existing.bestCombo, bestCombo),
                  totalSorted: { increment: sorted },
                  gamesPlayed: { increment: 1 },
                },
              });
              await recordGamePlay(userId);
              await reportGameResult(userId, { game: 'laundry-sort', score });
              return Response.json({ ok: true, personalBest });
            }

            // First run for this account. `username` is unique across the board,
            // so a display name someone else already claimed falls back to a
            // suffixed form rather than losing the score.
            const base = (session.user.name || 'Player')
              .trim()
              .replace(/[^a-zA-Z0-9_\-. ]/g, '')
              .slice(0, 24);
            const username = base.length >= 2 ? base : `Player-${userId.slice(0, 6)}`;

            try {
              await prisma.laundryPlayer.create({
                data: { userId, username, highScore: score, bestCombo, totalSorted: sorted },
              });
            } catch {
              await prisma.laundryPlayer.create({
                data: {
                  userId,
                  username: `${username}-${userId.slice(0, 6)}`.slice(0, 32),
                  highScore: score,
                  bestCombo,
                  totalSorted: sorted,
                },
              });
            }

            await recordGamePlay(userId);
            await reportGameResult(userId, { game: 'laundry-sort', score });
            return Response.json({ ok: true, personalBest: true });
          } catch (error) {
            console.error('Laundry score submit failed:', error);
            return Response.json({ error: 'Internal server error' }, { status: 500 });
          }
        },
      ),
    },
  },
});
