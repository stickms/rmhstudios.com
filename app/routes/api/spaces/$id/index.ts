import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { getSpace } from '@/lib/spaces.server';

/**
 * GET /api/spaces/$id — one space (plus post-end transcript when recordChat).
 * Public read, except a PRIVATE community's Space: non-members get a 404 so
 * neither the room nor its transcript leaks.
 */
export const Route = createFileRoute('/api/spaces/$id/')({
  server: {
    handlers: {
      GET: defineHandler(
        { auth: 'optional', rateLimit: 'read', cache: { visibility: 'private', maxAge: 0 } },
        async ({ userId, params }) => {
          const space = await getSpace(params.id, userId);
          if (!space) return Response.json({ error: 'Not found' }, { status: 404 });
          return Response.json({ space });
        },
      ),
    },
  },
});
