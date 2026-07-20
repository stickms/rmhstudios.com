import { createFileRoute } from '@tanstack/react-router';
import { auth } from '@/lib/auth';
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
      POST: async ({ request }) => {
        try {
          const session = await auth.api.getSession({ headers: request.headers });
          if (!session) return Response.json({ ok: false }, { status: 401 });

          const { allowed } = rateLimit(getClientIp(request), {
            limit: 120,
            windowMs: 60_000,
            prefix: 'history-beat',
          });
          if (!allowed) return Response.json({ error: 'Too many requests' }, { status: 429 });

          const body = await request.json().catch(() => null);
          const parsed = historyBeatSchema.safeParse(body);
          if (!parsed.success) return Response.json({ error: 'Invalid input' }, { status: 400 });

          await recordBeat(session.user.id, parsed.data);
          return Response.json({ ok: true });
        } catch (error) {
          console.error('History beat error:', error);
          return Response.json({ error: 'Internal Server Error' }, { status: 500 });
        }
      },
    },
  },
});
