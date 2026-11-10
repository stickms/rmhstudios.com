import { createFileRoute } from '@tanstack/react-router';
import { implement } from '@/lib/api/implement.server';
import { submitLaundryScoreApi } from '@/lib/laundry-sort/laundry.contract';
import { laundryScoreBody } from '@/lib/laundry-sort/score-schema';
import { prisma } from '@/lib/prisma.server';
import { recordGamePlay } from '@/lib/quests/engine.server';
import { reportGameResult } from '@/lib/game/results.server';
import { SCORE, comboMultiplier } from '@/lib/laundry-sort/constants';

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

/** The most a run of `sorted` correct garments could possibly be worth. */
function scoreCeiling(sorted: number): number {
  return Math.round(sorted * SCORE.correct * comboMultiplier(SCORE.maxComboSteps));
}

export const Route = createFileRoute('/api/laundry-sort/score')({
  server: {
    handlers: {
      POST: implement(
        submitLaundryScoreApi,
        {
          rateLimit: { limit: 10, windowMs: 60_000, prefix: 'laundry-score' },
          body: laundryScoreBody,
        },
        async ({ session, body }) => {
          const userId = session.user.id;
          const { score, sorted, bestCombo } = body;

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
        },
      ),
    },
  },
});
