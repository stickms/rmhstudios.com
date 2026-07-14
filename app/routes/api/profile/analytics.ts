import { createFileRoute } from '@tanstack/react-router';
import { auth } from '@/lib/auth';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { getCreatorAnalytics } from '@/lib/analytics.server';

/** GET /api/profile/analytics — the signed-in creator's own reach/engagement. */
export const Route = createFileRoute('/api/profile/analytics')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const session = await auth.api.getSession({ headers: request.headers });
          if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });

          const { allowed } = rateLimit(getClientIp(request), {
            limit: 30,
            windowMs: 60_000,
            prefix: 'creator-analytics',
          });
          if (!allowed) return Response.json({ error: 'Too many requests' }, { status: 429 });

          const analytics = await getCreatorAnalytics(session.user.id);
          return Response.json(analytics);
        } catch (error) {
          console.error('Creator analytics error:', error);
          return Response.json({ error: 'Internal Server Error' }, { status: 500 });
        }
      },
    },
  },
});
