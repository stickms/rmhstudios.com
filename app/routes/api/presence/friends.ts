import { createFileRoute } from '@tanstack/react-router';
import { auth } from '@/lib/auth';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { getOnlineFriends } from '@/lib/presence.server';

/**
 * GET /api/presence/friends — people the caller follows who are online now,
 * plus any joinable room they're in.
 */
export const Route = createFileRoute('/api/presence/friends')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const session = await auth.api.getSession({ headers: request.headers });
          if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });

          const { allowed } = rateLimit(getClientIp(request), {
            limit: 30,
            windowMs: 60_000,
            prefix: 'presence-friends',
          });
          if (!allowed) return Response.json({ error: 'Too many requests' }, { status: 429 });

          const friends = await getOnlineFriends(session.user.id);
          return Response.json({ friends });
        } catch (error) {
          console.error('Online friends error:', error);
          return Response.json({ friends: [] }, { status: 200 });
        }
      },
    },
  },
});
