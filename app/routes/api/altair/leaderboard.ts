import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { prisma } from '@/lib/prisma.server';

export const Route = createFileRoute('/api/altair/leaderboard')({
  server: {
    handlers: {
      GET: defineHandler(
        { auth: 'none', rateLimit: { limit: 20, windowMs: 60_000, prefix: 'altair-leaderboard' } },
        async ({ request }) => {
          try {
            const { searchParams } = new URL(request.url);
            const type = searchParams.get('type') || 'time';

            let orderBy = {};
            switch (type) {
              case 'kills':
                orderBy = { totalKills: 'desc' };
                break;
              case 'xp':
                orderBy = { totalXP: 'desc' };
                break;
              case 'gold':
                orderBy = { totalGold: 'desc' };
                break;
              case 'survival':
                orderBy = { totalTimeSurvived: 'desc' };
                break;
              case 'time':
              default:
                orderBy = { bestTime: 'desc' };
                break;
            }

            const leaderboard = await prisma.altairPlayer.findMany({
              take: 10,
              orderBy: orderBy,
              select: {
                username: true,
                bestTime: true,
                totalKills: true,
                totalXP: true,
                totalGold: true,
                totalTimeSurvived: true,
                gamesPlayed: true,
              },
            });

            return Response.json(leaderboard);
          } catch (e: any) {
            console.error('Altair leaderboard fetch failed:', {
              error: e.message,
              stack: e.stack,
            });
            return Response.json(
              {
                error: 'Internal Server Error',
                message: process.env.NODE_ENV === 'development' ? e.message : undefined,
              },
              { status: 500 },
            );
          }
        },
      ),
    },
  },
});
