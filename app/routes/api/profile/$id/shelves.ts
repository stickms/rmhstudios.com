import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { getPublicShelves } from '@/lib/reading/shelves.server';

/**
 * GET /api/profile/:id/shelves — the shelves a profile owner made public (L7).
 * The owner also sees their private shelves. Loaded lazily by the profile tab.
 */
export const Route = createFileRoute('/api/profile/$id/shelves')({
  server: {
    handlers: {
      GET: defineHandler({ auth: 'optional', rateLimit: 'read' }, async ({ userId, params }) => {
        const shelves = await getPublicShelves(params.id, userId);
        if (!shelves) return Response.json({ error: 'Not found' }, { status: 404 });
        return Response.json(shelves, { headers: { 'Cache-Control': 'private, no-store' } });
      }),
    },
  },
});
