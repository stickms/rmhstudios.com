import { createFileRoute } from '@tanstack/react-router';
import { getSpace } from '@/lib/spaces.server';

/**
 * GET /api/spaces/$id — one space (plus post-end transcript when recordChat).
 * Public read: the room page is SSR-able for signed-out visitors.
 */
export const Route = createFileRoute('/api/spaces/$id/')({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const space = await getSpace(params.id);
        if (!space) return Response.json({ error: 'Not found' }, { status: 404 });
        return Response.json({ space });
      },
    },
  },
});
