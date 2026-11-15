import { createFileRoute } from '@tanstack/react-router';
import { implement } from '@/lib/api/implement.server';
import { getGhostApi, saveGhostApi } from '@/lib/game/replay.contract';
import { getGhostQuery, saveGhostBody } from '@/lib/game/replay-schema';
import { getGhost, ReplayError, saveGhost } from '@/lib/replays.server';

/**
 * Race ghosts (plan U9).
 *
 * GET  /api/replays/ghost?game=neon-driftway&level=1&vs=pb|top — the trace to race.
 * POST /api/replays/ghost — store the caller's ghost for a level (on a new best).
 */
export const Route = createFileRoute('/api/replays/ghost')({
  server: {
    handlers: {
      GET: implement(
        getGhostApi,
        { auth: 'optional', rateLimit: 'read', query: getGhostQuery },
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
      POST: implement(
        saveGhostApi,
        { rateLimit: { limit: 10, windowMs: 60_000, prefix: 'ghost-save' }, body: saveGhostBody },
        async ({ userId, body }) => {
          if (body.data.level !== body.level) {
            return Response.json({ error: 'Level mismatch' }, { status: 400 });
          }
          try {
            const saved = await saveGhost({ userId, ...body });
            return Response.json({ id: saved.id }, { status: 201 });
          } catch (err) {
            if (err instanceof ReplayError) {
              return Response.json(
                { error: 'Invalid ghost' },
                { status: err.code === 'TOO_LARGE' ? 413 : 400 },
              );
            }
            throw err;
          }
        },
      ),
    },
  },
});
