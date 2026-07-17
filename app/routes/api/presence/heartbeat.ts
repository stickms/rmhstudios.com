import { createFileRoute } from '@tanstack/react-router';
import { auth } from '@/lib/auth';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { markPresence } from '@/lib/hot-counters.server';

/**
 * POST /api/presence/heartbeat — mark the current user as online now.
 * Called periodically by active clients; rate-limited so it can't be abused.
 */
export const Route = createFileRoute('/api/presence/heartbeat')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const session = await auth.api.getSession({ headers: request.headers });
        if (!session) return Response.json({ ok: false }, { status: 401 });

        const ip = getClientIp(request);
        // One write per ~30s per IP is plenty.
        const { allowed } = rateLimit(ip, { limit: 3, windowMs: 30_000, prefix: 'presence' });
        if (!allowed) return Response.json({ ok: true, throttled: true });

        // Marks presence in the Redis "online now" set and throttles the
        // Postgres lastSeenAt write to ~once/5min per user (falls back to a
        // direct write when Redis is unavailable).
        await markPresence(session.user.id);
        return Response.json({ ok: true });
      },
    },
  },
});
