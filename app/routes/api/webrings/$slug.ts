import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { ringSlugSchema } from '@/lib/profile/webrings';
import { deleteOwnRing, getRingDetail } from '@/lib/profile/webrings.server';

/**
 * GET    /api/webrings/$slug — a ring and its members in join order (P6). Members
 *        who are deleted, banned, or blocked either way with the viewer are left out.
 * DELETE /api/webrings/$slug — the owner closes the ring.
 */
export const Route = createFileRoute('/api/webrings/$slug')({
  server: {
    handlers: {
      GET: defineHandler({ auth: 'optional', rateLimit: 'read' }, async ({ params, userId }) => {
        const slug = ringSlugSchema.safeParse(params.slug);
        const ring = slug.success ? await getRingDetail(slug.data, userId) : null;
        if (!ring) return Response.json({ error: 'Not found' }, { status: 404 });
        return Response.json(ring, { headers: { 'Cache-Control': 'private, no-store' } });
      }),
      DELETE: defineHandler({ rateLimit: 'write' }, async ({ params, userId }) => {
        const ok = await deleteOwnRing(userId, params.slug);
        return ok
          ? Response.json({ success: true })
          : Response.json({ error: 'Not found' }, { status: 404 });
      }),
    },
  },
});
