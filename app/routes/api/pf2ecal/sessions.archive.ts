import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { getArchivedSessions } from '@/lib/pf2ecal/sessions.server';
import { archiveQuerySchema } from '@/lib/pf2ecal/types';

/**
 * GET /api/pf2ecal/sessions/archive?before=<iso>&limit=<n> — older nights.
 *
 * The board carries a rolling month of history, which is the right amount to
 * have on screen and the wrong amount for "what did we play in March".
 * Widening that window would grow the payload of every load, forever, for
 * something almost nobody scrolls to — so looking back is a separate read that
 * only happens when someone actually looks.
 *
 * `before` is a cursor on `startsAt` rather than an offset: sessions are added
 * and moved while someone is reading, and an offset would make a page skip or
 * repeat a row when that happens.
 *
 * `auth: 'none'` and the `read` policy, like the board itself — this returns
 * the same sessions, just older ones.
 */
export const Route = createFileRoute('/api/pf2ecal/sessions/archive')({
  server: {
    handlers: {
      GET: defineHandler(
        { auth: 'none', rateLimit: 'read', query: archiveQuerySchema },
        async ({ query }) => {
          const { sessions, hasMore } = await getArchivedSessions(
            new Date(query.before),
            query.limit,
          );
          return Response.json({ sessions, hasMore });
        },
      ),
    },
  },
});
