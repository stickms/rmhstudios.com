import { createFileRoute } from '@tanstack/react-router';
import { auth } from '@/lib/auth';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { getReplay, deleteReplay, ReplayError } from '@/lib/replays.server';

/**
 * GET    /api/replays/{id} — fetch a replay. Public replays are readable
 *                            anonymously; unlisted requires the owner.
 * DELETE /api/replays/{id} — delete a replay (owner only).
 */
export const Route = createFileRoute('/api/replays/$id')({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        try {
          const replay = await getReplay(params.id);
          if (!replay) return Response.json({ error: 'Not found' }, { status: 404 });

          if (replay.visibility !== 'public') {
            // Unlisted replays are only returned to their owner.
            const session = await auth.api.getSession({ headers: request.headers });
            if (!session || session.user.id !== replay.author.id) {
              return Response.json({ error: 'Not found' }, { status: 404 });
            }
          }

          return Response.json({ replay });
        } catch (error) {
          console.error('Replay fetch error:', error);
          return Response.json({ error: 'Internal Server Error' }, { status: 500 });
        }
      },

      DELETE: async ({ request, params }) => {
        try {
          const session = await auth.api.getSession({ headers: request.headers });
          if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });

          const { allowed } = rateLimit(getClientIp(request), {
            limit: 30,
            windowMs: 60_000,
            prefix: 'replay-delete',
          });
          if (!allowed) return Response.json({ error: 'Too many requests' }, { status: 429 });

          const deleted = await deleteReplay(params.id, session.user.id);
          if (!deleted) return Response.json({ error: 'Not found' }, { status: 404 });

          return Response.json({ ok: true });
        } catch (error) {
          if (error instanceof ReplayError && error.code === 'FORBIDDEN') {
            return Response.json({ error: 'Forbidden' }, { status: 403 });
          }
          console.error('Replay delete error:', error);
          return Response.json({ error: 'Internal Server Error' }, { status: 500 });
        }
      },
    },
  },
});
