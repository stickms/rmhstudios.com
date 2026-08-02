import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { prisma } from '@/lib/prisma.server';

export const Route = createFileRoute('/api/signal-forge/leaderboard')({
  server: {
    handlers: {
      GET: defineHandler(
        {
          auth: 'none',
          rateLimit: { limit: 20, windowMs: 60_000, prefix: 'signal-forge-leaderboard' },
        },
        async () => {
          try {
            const leaderboard = await prisma.signalForgePlayer.findMany({
              take: 100,
              orderBy: [{ highScore: 'desc' }, { floorReached: 'desc' }],
              select: {
                username: true,
                highScore: true,
                floorReached: true,
                gamesPlayed: true,
                updatedAt: true,
              },
            });

            return Response.json(leaderboard);
          } catch (error) {
            console.error('Error fetching Signal Forge leaderboard:', error);
            return Response.json({ error: 'Internal Server Error' }, { status: 500 });
          }
        },
      ),
    },
  },
});
