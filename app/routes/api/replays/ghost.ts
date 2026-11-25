import { createFileRoute } from '@tanstack/react-router';
import { implement } from '@/lib/api/implement.server';
import { getGhostApi, saveGhostApi } from '@/lib/game/replay.contract';
import { getGhostQuery, saveGhostBody } from '@/lib/game/replay-schema';
import { getGhost, ReplayError, saveGhost } from '@/lib/replays.server';
import { refusalBody } from '@/lib/errors/codes';
import { consumeAssistRun } from '@/lib/game/assist-run.server';

/**
 * Race ghosts (plan U9).
 *
 * GET  /api/replays/ghost?game=neon-driftway&level=1&vs=pb|top|friend[&friend=<userId>] — the trace to race. A friend's
 * ghost needs a session (401 without one) and is refused with GHOST_FRIEND_UNAVAILABLE when that friend does not qualify.
 * POST /api/replays/ghost — store the caller's ghost for a level (on a new best). An assisted run stores nothing
 * and answers `{ saved: false, reason: 'assisted' }`.
 */
export const Route = createFileRoute('/api/replays/ghost')({
  server: {
    handlers: {
      GET: implement(
        getGhostApi,
        { auth: 'optional', rateLimit: 'read', query: getGhostQuery },
        async ({ userId, query }) => {
          if (query.vs === 'friend') {
            if (!userId) return Response.json({ ...refusalBody('UNAUTHORIZED') }, { status: 401 });
            const friendGhost = await getGhost({ ...query, viewerId: userId });
            if (!friendGhost) return Response.json({ ...refusalBody('GHOST_FRIEND_UNAVAILABLE') }, { status: 404 });
            // A friend who unfollows or hides must drop out within a minute.
            return Response.json({ ghost: friendGhost }, { headers: { 'Cache-Control': 'private, max-age=60' } });
          }
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
          // An assisted run is not a record, so it sets no ghost. The server decides this from the run-start
          // claim (read, not cleared, like the other second submit paths), never from the client.
          if (await consumeAssistRun(userId, body.game, { keepClaim: true, settleClaim: true })) {
            return Response.json({ saved: false, reason: 'assisted' });
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
