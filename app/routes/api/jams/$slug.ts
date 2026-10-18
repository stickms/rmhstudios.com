import { createFileRoute } from '@tanstack/react-router';
import { defineHandler, notFound } from '@/lib/api/handler.server';
import { getJam } from '@/lib/competitive/jams.server';

/** GET /api/jams/:slug — a jam with entries (once started) and, when done, results. */
export const Route = createFileRoute('/api/jams/$slug')({
  server: {
    handlers: {
      GET: defineHandler({ auth: 'optional', rateLimit: 'read' }, async ({ params, userId }) => {
        const jam = await getJam(params.slug, userId);
        if (!jam) return notFound('Jam not found');
        return Response.json({ jam }, { headers: { 'Cache-Control': 'private, no-store' } });
      }),
    },
  },
});
