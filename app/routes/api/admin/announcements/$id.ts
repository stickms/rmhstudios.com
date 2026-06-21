import { createFileRoute } from '@tanstack/react-router';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma.server';
import { z } from 'zod';

/**
 * POST  /api/admin/announcements/$id — toggle active / edit fields. Admin only.
 * DELETE /api/admin/announcements/$id — delete an announcement.
 */
const updateSchema = z.object({
  active: z.boolean().optional(),
  pinned: z.boolean().optional(),
});

async function requireAdmin(request: Request) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session || !(session.user as { isAdmin?: boolean }).isAdmin) return null;
  return session;
}

export const Route = createFileRoute('/api/admin/announcements/$id')({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const session = await requireAdmin(request);
        if (!session) return Response.json({ error: 'Forbidden' }, { status: 403 });
        const body = await request.json().catch(() => ({}));
        const parsed = updateSchema.safeParse(body);
        if (!parsed.success) return Response.json({ error: 'Invalid input' }, { status: 400 });
        await prisma.feedAnnouncement.update({
          where: { id: params.id },
          data: parsed.data,
        });
        return Response.json({ success: true });
      },
      DELETE: async ({ request, params }) => {
        const session = await requireAdmin(request);
        if (!session) return Response.json({ error: 'Forbidden' }, { status: 403 });
        await prisma.feedAnnouncement.delete({ where: { id: params.id } }).catch(() => {});
        return Response.json({ success: true });
      },
    },
  },
});
