import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { prisma } from '@/lib/prisma.server';

export const Route = createFileRoute('/api/vega/leaderboard')({
  server: {
    handlers: {
      GET: defineHandler(
        { auth: 'none', rateLimit: { limit: 20, windowMs: 60_000, prefix: 'vega-leaderboard' } },
        async () => {
          try {
            const leaderboard = await prisma.vegaPlayer.findMany({
              take: 10,
              orderBy: [{ highestLoop: 'desc' }, { highestLevel: 'desc' }],
              select: {
                username: true,
                highestLoop: true,
                highestLevel: true,
                updatedAt: true,
              },
            });

            return Response.json(leaderboard);
          } catch (e: any) {
            console.error('Error fetching Vega leaderboard:', {
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
