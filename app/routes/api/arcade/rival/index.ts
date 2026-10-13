import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { defineHandler, notFound } from '@/lib/api/handler.server';
import { getRival, hasBoard } from '@/lib/arcade/rivals.server';

const query = z.object({ gameId: z.string().max(48) });

/** GET /api/arcade/rival?gameId — the player just above you on that game's board. */
export const Route = createFileRoute('/api/arcade/rival/')({
  server: {
    handlers: {
      GET: defineHandler({ rateLimit: 'read', query }, async ({ userId, query: q }) => {
        if (!hasBoard(q.gameId)) return notFound('No leaderboard for that game');
        const result = await getRival(userId, q.gameId);
        return Response.json(result ?? { ranked: false });
      }),
    },
  },
});
