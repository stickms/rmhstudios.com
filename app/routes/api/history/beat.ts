import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { historyBeatSchema } from '@/lib/history/constants';
import { recordBeat } from '@/lib/history/history.server';

/**
 * POST /api/history/beat — record/refresh a visit (throttled by the client).
 * Silently no-ops (200) when the caller paused history. Chatty by design.
 */
export const Route = createFileRoute('/api/history/beat')({
  server: {
    handlers: {
      POST: defineHandler(
        { auth: 'optional', body: historyBeatSchema },
        async ({ request, session, body }) => {
          if (!session) return Response.json({ ok: false }, { status: 401 });

          const { allowed } = rateLimit(getClientIp(request), {
            limit: 120,
            windowMs: 60_000,
            prefix: 'history-beat',
          });
          if (!allowed) return Response.json({ error: 'Too many requests' }, { status: 429 });

          await recordBeat(session.user.id, body);
          return Response.json({ ok: true });
        },
      ),
    },
  },
});
