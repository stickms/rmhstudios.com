import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { defineHandler } from '@/lib/api/handler.server';
import { getGhost, ReplayError, saveGhost } from '@/lib/replays.server';

/**
 * Race ghosts (plan U9).
 *
 * GET  /api/replays/ghost?game=neon-driftway&level=1&vs=pb|top — the trace to race.
 * POST /api/replays/ghost — store the caller's ghost for a level (on a new best).
 */
const getQuery = z.object({
  game: z.literal('neon-driftway'),
  level: z.coerce.number().int().min(1).max(3),
  vs: z.enum(['pb', 'top']).default('pb'),
});

const postBody = z.object({
  game: z.literal('neon-driftway'),
  level: z.number().int().min(1).max(3),
  data: z.record(z.string(), z.unknown()),
  score: z.number().int().min(0).max(100_000_000),
  durationMs: z.number().int().min(0).max(24 * 60 * 60 * 1000),
});

export const Route = createFileRoute('/api/replays/ghost')({
  server: {
    handlers: {
      GET: defineHandler(
        { auth: 'optional', rateLimit: 'read', query: getQuery },
        async ({ userId, query }) => {
          const ghost = await getGhost({ ...query, viewerId: userId });
          if (!ghost) return Response.json({ ghost: null });
          return Response.json(
            { ghost },
            // A ghost only changes when its owner sets a new best.
            { headers: { 'Cache-Control': 'private, max-age=300' } },
          );
        },
      ),
      POST: defineHandler(
        { rateLimit: { limit: 10, windowMs: 60_000, prefix: 'ghost-save' }, body: postBody },
        async ({ userId, body }) => {
          if (body.data.level !== body.level) {
            return Response.json({ error: 'Level mismatch' }, { status: 400 });
          }
          try {
            const saved = await saveGhost({ userId, ...body });
            return Response.json({ id: saved.id }, { status: 201 });
          } catch (err) {
            if (err instanceof ReplayError) {
              return Response.json({ error: 'Invalid ghost' }, { status: err.code === 'TOO_LARGE' ? 413 : 400 });
            }
            throw err;
          }
        },
      ),
    },
  },
});
