import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { prisma } from '@/lib/prisma.server';
import { updateAnnouncementSchema } from '@/lib/pf2ecal/types';

/**
 * PATCH  /api/pf2ecal/announcements/:id — edit the text or pin it.
 * DELETE /api/pf2ecal/announcements/:id — remove it.
 *
 * Like everything else on this page: signed in is the only requirement.
 */
export const Route = createFileRoute('/api/pf2ecal/announcements/$id')({
  server: {
    handlers: {
      PATCH: defineHandler(
        { rateLimit: 'write', body: updateAnnouncementSchema },
        async ({ params, body }) => {
          const { count } = await prisma.pf2eAnnouncement.updateMany({
            where: { id: params.id },
            data: {
              ...(body.body !== undefined && { body: body.body }),
              ...(body.pinned !== undefined && { pinned: body.pinned }),
            },
          });
          if (!count) return Response.json({ error: 'Not found' }, { status: 404 });
          return Response.json({ ok: true });
        },
      ),

      DELETE: defineHandler({ rateLimit: 'write' }, async ({ params }) => {
        const { count } = await prisma.pf2eAnnouncement.deleteMany({ where: { id: params.id } });
        return Response.json({ deleted: count > 0 });
      }),
    },
  },
});
