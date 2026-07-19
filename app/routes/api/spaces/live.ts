import { createFileRoute } from '@tanstack/react-router';
import { listLiveSpaces } from '@/lib/spaces.server';

/**
 * GET /api/spaces/live — the "Live now" rail feed. Public (unauthenticated
 * visitors see liveness too); no rate limit beyond the front-door proxy.
 */
export const Route = createFileRoute('/api/spaces/live')({
  server: {
    handlers: {
      GET: async () => {
        const spaces = await listLiveSpaces();
        return Response.json(
          { spaces },
          { headers: { 'Cache-Control': 'public, max-age=5, stale-while-revalidate=20' } },
        );
      },
    },
  },
});
