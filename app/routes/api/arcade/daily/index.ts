import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { dailyMutator, utcDayKey } from '@/lib/arcade/seeded';
import { getDailyBoard, getMyDaily } from '@/lib/arcade/runs.server';

/** GET /api/arcade/daily — today's mutator, its board, and the caller's attempt. */
export const Route = createFileRoute('/api/arcade/daily/')({
  server: {
    handlers: {
      GET: defineHandler({ auth: 'optional', rateLimit: 'read' }, async ({ userId }) => {
        const mutator = dailyMutator(utcDayKey());
        const [board, mine] = await Promise.all([
          getDailyBoard(mutator.day, mutator.gameId),
          userId ? getMyDaily(userId, mutator.day, mutator.gameId) : Promise.resolve(null),
        ]);
        return Response.json(
          { mutator, board: board.map((r) => ({ ...r, isMe: r.userId === userId })), mine },
          { headers: { 'Cache-Control': 'private, no-store' } },
        );
      }),
    },
  },
});
