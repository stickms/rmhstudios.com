import { createFileRoute } from '@tanstack/react-router';
import { implement } from '@/lib/api/implement.server';
import { submitSignalForgeScoreApi } from '@/lib/signal-forge/signal-forge.contract';
import { signalForgeScoreBody, signalForgeScoreMessage } from '@/lib/signal-forge/score-schema';
import { prisma } from '@/lib/prisma.server';
import { recordGamePlay } from '@/lib/quests/engine.server';

export const Route = createFileRoute('/api/signal-forge/score')({
  server: {
    handlers: {
      POST: implement(
        submitSignalForgeScoreApi,
        {
          rateLimit: { limit: 5, windowMs: 60_000, prefix: 'signal-forge-score' },
          body: signalForgeScoreBody,
          invalid: (error) =>
            Response.json({ error: signalForgeScoreMessage(error) }, { status: 400 }),
        },
        async ({ session, body }) => {
          const { score, floorReached } = body;

          const username = session.user.name || session.user.email || 'Anonymous';

          // Find existing profile
          const existingProfile = await prisma.signalForgePlayer.findUnique({
            where: { userId: session.user.id },
          });

          if (existingProfile) {
            const isBetter =
              score > existingProfile.highScore ||
              (score === existingProfile.highScore && floorReached > existingProfile.floorReached);

            const updated = await prisma.signalForgePlayer.update({
              where: { userId: session.user.id },
              data: {
                highScore: Math.max(existingProfile.highScore, score),
                floorReached: Math.max(existingProfile.floorReached, floorReached),
                gamesPlayed: { increment: 1 },
                username,
              },
            });
            await recordGamePlay(session.user.id);
            return Response.json({ success: true, profile: updated, isRecord: isBetter });
          } else {
            const newProfile = await prisma.signalForgePlayer.create({
              data: {
                userId: session.user.id,
                username,
                highScore: score,
                floorReached,
                gamesPlayed: 1,
              },
            });
            await recordGamePlay(session.user.id);
            return Response.json({ success: true, profile: newProfile, isRecord: true });
          }
        },
      ),
    },
  },
});
