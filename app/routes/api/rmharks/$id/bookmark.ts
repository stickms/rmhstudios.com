import { createFileRoute } from '@tanstack/react-router';
import { auth } from '@/lib/auth';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { toggleBookmark } from '@/lib/social/engagement.server';

/** POST /api/rmharks/$id/bookmark — toggle a bookmark on a post. */
export const Route = createFileRoute('/api/rmharks/$id/bookmark')({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        try {
          const session = await auth.api.getSession({ headers: request.headers });
          if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });

          const ip = getClientIp(request);
          const { allowed } = rateLimit(ip, { limit: 60, windowMs: 60_000, prefix: 'rmhark-bookmark' });
          if (!allowed) return Response.json({ error: 'Too many requests' }, { status: 429 });

          const { id } = params;
          const result = await toggleBookmark(session.user.id, id);
          if (!result.found) return Response.json({ error: 'Post not found' }, { status: 404 });
          return Response.json({ success: true, bookmarked: result.bookmarked });
        } catch (error) {
          console.error('Toggle bookmark error:', error);
          return Response.json({ error: 'Internal Server Error' }, { status: 500 });
        }
      },
    },
  },
});
