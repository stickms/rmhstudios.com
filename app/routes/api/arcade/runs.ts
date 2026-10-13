import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { defineHandler } from '@/lib/api/handler.server';
import { getSeedBoard, submitRun } from '@/lib/arcade/runs.server';

const bodySchema = z.object({
  kind: z.enum(['daily', 'seed']),
  gameId: z.string().max(48),
  seedKey: z.string().max(64),
  score: z.number().int().min(0).max(10_000_000),
  detail: z.record(z.string(), z.number().finite()).optional(),
});
const querySchema = z.object({ gameId: z.string().max(48), seedKey: z.string().max(64) });

/**
 * POST /api/arcade/runs — finish a daily attempt or record a run on a shared seed.
 * GET  /api/arcade/runs?gameId&seedKey — the mini leaderboard for one shared seed.
 */
export const Route = createFileRoute('/api/arcade/runs')({
  server: {
    handlers: {
      GET: defineHandler(
        { auth: 'optional', rateLimit: 'read', query: querySchema },
        async ({ query, userId }) => {
          const board = await getSeedBoard(query.gameId, query.seedKey);
          return Response.json({ board: board.map((r) => ({ ...r, isMe: r.userId === userId })) });
        },
      ),
      POST: defineHandler(
        { rateLimit: { limit: 20, windowMs: 60_000, prefix: 'arcade-run' }, body: bodySchema },
        async ({ userId, body }) => {
          const result = await submitRun({ userId, ...body });
          if (!result.ok) return Response.json({ error: result.error }, { status: result.status });
          return Response.json({ counted: result.counted, best: result.best ?? null });
        },
      ),
    },
  },
});
