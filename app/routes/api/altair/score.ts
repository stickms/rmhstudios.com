import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { prisma } from '@/lib/prisma.server';
import { z } from 'zod';
import { recordGamePlay } from '@/lib/quests/engine.server';

const altairScoreBody = z.object({
  timeSurvived: z.number().min(0).max(86400),
  kills: z.number().min(0).max(1_000_000),
  totalXP: z.number().min(0).max(100_000_000),
  // Out-of-range or non-numeric gold was never an error: it counted as 0.
  gold: z.unknown().optional(),
});

/** The old route's bespoke 400 texts, chosen by the field that failed. */
function altairScoreMessage(error: z.ZodError): string {
  const field = error.issues[0]?.path[0];
  if (field === 'kills') return 'Invalid kills';
  if (field === 'totalXP') return 'Invalid XP';
  return 'Invalid time';
}

export const Route = createFileRoute('/api/altair/score')({
  server: {
    handlers: {
      POST: defineHandler(
        {
          rateLimit: { limit: 5, windowMs: 60_000, prefix: 'altair-score' },
          body: altairScoreBody,
          invalid: (error) => Response.json({ error: altairScoreMessage(error) }, { status: 400 }),
        },
        async ({ user, userId, body }) => {
          const { timeSurvived, kills, totalXP, gold } = body;
          const goldValue = typeof gold === 'number' && gold >= 0 && gold <= 10_000_000 ? gold : 0;

          // Get username from auth session
          const username = (user.name || user.username || 'Player').slice(0, 32);

          const existingProfile = await prisma.altairPlayer.findUnique({ where: { userId } });

          // LEGACY intake. Current clients never call this: their runs are replayed server-side and the
          // leaderboard rows are written from the replay (lib/altair/solo/persist.server.ts). What still
          // arrives here is an old client's self-report, so it is bounded to what play could produce, and
          // ALTAIR_LEGACY_SCORE=0 closes it once old clients are gone.
          if (process.env.ALTAIR_LEGACY_SCORE === '0') {
            return Response.json({ error: 'Gone' }, { status: 410 });
          }
          const sinceLast = existingProfile
            ? (Date.now() - existingProfile.updatedAt.getTime()) / 1000
            : 2400;
          if (
            timeSurvived > sinceLast * 1.2 + 120 ||
            kills > timeSurvived * 40 + 50 ||
            goldValue > timeSurvived * 12 + 200
          ) {
            return Response.json({ error: 'Implausible run' }, { status: 400 });
          }

          if (existingProfile) {
            await prisma.altairPlayer.update({
              where: { id: existingProfile.id },
              data: {
                bestTime: Math.max(existingProfile.bestTime, timeSurvived),
                totalKills: { increment: kills },
                totalXP: { increment: totalXP },
                totalGold: { increment: goldValue },
                totalTimeSurvived: { increment: timeSurvived },
                gamesPlayed: { increment: 1 },
                updatedAt: new Date(),
                username, // Keep username in sync with auth
              },
            });
            await recordGamePlay(userId);
            return Response.json({ success: true, linked: true });
          }

          // Create new
          await prisma.altairPlayer.create({
            data: {
              userId,
              username,
              bestTime: timeSurvived,
              totalKills: kills,
              totalXP: totalXP,
              totalGold: goldValue,
              totalTimeSurvived: timeSurvived,
              gamesPlayed: 1,
            },
          });
          await recordGamePlay(userId);
          return Response.json({ success: true, created: true });
        },
      ),
    },
  },
});
