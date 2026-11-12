import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { submitVegaScoreApi } from '@features/vega/engine/vega.contract';
import { vegaScoreBody } from '@features/vega/engine/score-schema';
import { prisma } from '@/lib/prisma.server';
import { recordGamePlay } from '@/lib/quests/engine.server';

export const route = apiRoute('/api/vega/score', {
  POST: implement(
    submitVegaScoreApi,
    {
      rateLimit: { limit: 5, windowMs: 60_000, prefix: 'vega-score' },
      body: vegaScoreBody,
      invalid: () => Response.json({ error: 'Invalid data' }, { status: 400 }),
    },
    async ({ session, body }) => {
      const { highestLoop, highestLevel } = body;

      // Find existing profile
      const existingProfile = await prisma.vegaPlayer.findUnique({
        where: { userId: session.user.id },
      });

      if (existingProfile) {
        // Update if better
        // Primary metric: Loop. Secondary: Level.
        const isBetter =
          highestLoop > existingProfile.highestLoop ||
          (highestLoop === existingProfile.highestLoop &&
            highestLevel > existingProfile.highestLevel);

        const updated = await prisma.vegaPlayer.update({
          where: { userId: session.user.id },
          data: {
            highestLoop: Math.max(existingProfile.highestLoop, highestLoop),
            highestLevel: Math.max(existingProfile.highestLevel, highestLevel),
            gamesPlayed: { increment: 1 },
            username: session.user.name || session.user.email || 'Anonymous', // Update username if changed
          },
        });
        await recordGamePlay(session.user.id);
        return Response.json({ success: true, profile: updated, isRecord: isBetter });
      } else {
        // Create new
        const newProfile = await prisma.vegaPlayer.create({
          data: {
            userId: session.user.id,
            username: session.user.name || session.user.email || 'Anonymous',
            highestLoop,
            highestLevel,
            gamesPlayed: 1,
          },
        });
        await recordGamePlay(session.user.id);
        return Response.json({ success: true, profile: newProfile, isRecord: true });
      }
    },
  ),
});
