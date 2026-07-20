import { createFileRoute } from '@tanstack/react-router';
import { auth } from '@/lib/auth';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { endSpace, SpaceError } from '@/lib/spaces.server';

/** POST /api/spaces/$id/end — end the space (host only). */
export const Route = createFileRoute('/api/spaces/$id/end')({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        try {
          const session = await auth.api.getSession({ headers: request.headers });
          if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });

          const { allowed } = rateLimit(getClientIp(request), {
            limit: 20,
            windowMs: 60_000,
            prefix: 'space-end',
          });
          if (!allowed) return Response.json({ error: 'Too many requests' }, { status: 429 });

          const space = await endSpace(params.id, session.user.id);
          return Response.json({ space });
        } catch (error) {
          if (error instanceof SpaceError) {
            return Response.json({ error: error.message }, { status: error.status });
          }
          console.error('End space error:', error);
          return Response.json({ error: 'Internal server error' }, { status: 500 });
        }
      },
    },
  },
});
