import { createFileRoute } from '@tanstack/react-router';
import { notFound } from '@/lib/api/handler.server';
import { implement } from '@/lib/api/implement.server';
import { getJamApi } from '@/lib/competitive/jams.contract';
import { getJam } from '@/lib/competitive/jams.server';

/** GET /api/jams/:slug — a jam with entries (once started) and, when done, results. */
export const Route = createFileRoute('/api/jams/$slug')({
  server: {
    handlers: {
      GET: implement(getJamApi, { auth: 'optional', rateLimit: 'read' }, async ({ params, userId }) => {
        const jam = await getJam(params.slug, userId);
        if (!jam) return notFound('Jam not found');
        return Response.json({ jam }, { headers: { 'Cache-Control': 'private, no-store' } });
      }),
    },
  },
});
