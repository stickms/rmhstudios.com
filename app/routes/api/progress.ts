import { createFileRoute } from '@tanstack/react-router';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma.server';
import { levelInfo } from '@/lib/xp/levels';
import { getActiveQuests } from '@/lib/quests/engine.server';
import { CURRENT_SEASON, tierForXp } from '@/lib/battlepass/season';

/** GET /api/progress — the signed-in user's level, quests, and season summary. */
export const Route = createFileRoute('/api/progress')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const session = await auth.api.getSession({ headers: request.headers });
          if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });
          const userId = session.user.id;

          const [profile, seasonProgress, quests] = await Promise.all([
            prisma.userProfile.findUnique({ where: { userId }, select: { xp: true, coins: true } }),
            prisma.userSeasonProgress.findUnique({
              where: { userId_seasonId: { userId, seasonId: CURRENT_SEASON.id } },
              select: { seasonXp: true, premium: true },
            }),
            getActiveQuests(userId),
          ]);

          const seasonXp = seasonProgress?.seasonXp ?? 0;
          return Response.json({
            level: levelInfo(profile?.xp ?? 0),
            coins: profile?.coins ?? 0,
            quests,
            season: {
              id: CURRENT_SEASON.id,
              name: CURRENT_SEASON.name,
              endsAt: CURRENT_SEASON.endsAt,
              seasonXp,
              tier: tierForXp(seasonXp),
              maxTier: CURRENT_SEASON.tiers.length,
              premium: seasonProgress?.premium ?? false,
            },
          });
        } catch (error) {
          console.error('Progress fetch error:', error);
          return Response.json({ error: 'Internal Server Error' }, { status: 500 });
        }
      },
    },
  },
});
