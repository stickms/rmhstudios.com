import { createFileRoute } from '@tanstack/react-router';
import { auth } from '@/lib/auth';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { getActiveFriends } from '@/lib/presence.server';

/**
 * GET /api/friends/active — the caller's mutuals who are online now, each with
 * their live activity (subject to the target's presence visibility/detail) and
 * a joinable context target. Cached 15s per viewer in getActiveFriends.
 */
export const Route = createFileRoute('/api/friends/active')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const session = await auth.api.getSession({ headers: request.headers });
          if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });

          const { allowed } = rateLimit(getClientIp(request), {
            limit: 30,
            windowMs: 60_000,
            prefix: 'friends-active',
          });
          if (!allowed) return Response.json({ error: 'Too many requests' }, { status: 429 });

          const friends = await getActiveFriends(session.user.id);
          return Response.json({ friends });
        } catch (error) {
          console.error('Active friends error:', error);
          // Decorative surface — degrade to empty rather than erroring the page.
          return Response.json({ friends: [] }, { status: 200 });
        }
      },
    },
  },
});
