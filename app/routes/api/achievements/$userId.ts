import { createFileRoute } from '@tanstack/react-router';
import { prisma } from '@/lib/prisma.server';
import { ACHIEVEMENTS } from '@/lib/achievements/catalog';

/**
 * GET /api/achievements/$userId — a user's achievement progress, merged with the
 * full catalog. `$userId` may be an id or a handle. Secret achievements that are
 * not yet unlocked are returned masked.
 */
export const Route = createFileRoute('/api/achievements/$userId')({
  server: {
    handlers: {
      GET: async ({ params }) => {
        try {
          const { userId: idOrHandle } = params;
          const resolved = await prisma.user.findFirst({
            where: { OR: [{ id: idOrHandle }, { handle: idOrHandle }] },
            select: { id: true },
          });
          if (!resolved) return Response.json({ error: 'User not found' }, { status: 404 });

          const rows = await prisma.userAchievement.findMany({
            where: { userId: resolved.id },
            select: { achievementId: true, progress: true, unlockedAt: true },
          });
          const byId = new Map(rows.map((r) => [r.achievementId, r]));

          let unlockedCount = 0;
          let coinsEarned = 0;
          const achievements = ACHIEVEMENTS.map((def) => {
            const row = byId.get(def.id);
            const unlocked = !!row?.unlockedAt;
            if (unlocked) {
              unlockedCount++;
              coinsEarned += def.coinReward;
            }
            const masked = def.secret && !unlocked;
            return {
              id: def.id,
              name: masked ? '???' : def.name,
              description: masked ? 'Hidden achievement' : def.description,
              icon: masked ? '❓' : def.icon,
              category: def.category,
              tier: def.tier,
              group: def.group ?? null,
              target: def.target,
              coinReward: def.coinReward,
              secret: !!def.secret,
              unlocked,
              unlockedAt: row?.unlockedAt?.toISOString() ?? null,
              progress: Math.min(row?.progress ?? 0, def.target),
            };
          });

          return Response.json({
            stats: { unlocked: unlockedCount, total: ACHIEVEMENTS.length, coinsEarned },
            achievements,
          });
        } catch (error) {
          console.error('Achievements fetch error:', error);
          return Response.json({ error: 'Internal Server Error' }, { status: 500 });
        }
      },
    },
  },
});
