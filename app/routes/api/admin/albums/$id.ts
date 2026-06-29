import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma.server';
import { logAdminAction } from '@/lib/admin-audit.server';
import { deleteAlbum } from '@/lib/albums.admin.server';

/**
 * PATCH  /api/admin/albums/$id — edit album title/description. Admin only.
 * DELETE /api/admin/albums/$id — delete album, slides, and stored objects.
 */

const patchSchema = z.object({
  title: z.string().trim().min(1).max(120).optional(),
  description: z.string().trim().max(2000).optional(),
});

async function requireAdmin(request: Request) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session || !(session.user as { isAdmin?: boolean }).isAdmin) return null;
  return session;
}

export const Route = createFileRoute('/api/admin/albums/$id')({
  server: {
    handlers: {
      PATCH: async ({ request, params }) => {
        const session = await requireAdmin(request);
        if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });

        const body = await request.json().catch(() => null);
        const parsed = patchSchema.safeParse(body);
        if (!parsed.success || (parsed.data.title === undefined && parsed.data.description === undefined)) {
          return Response.json({ error: 'Nothing to update.' }, { status: 400 });
        }

        const exists = await prisma.album.findUnique({ where: { id: params.id }, select: { id: true } });
        if (!exists) return Response.json({ error: 'Album not found.' }, { status: 404 });

        const album = await prisma.album.update({
          where: { id: params.id },
          data: {
            ...(parsed.data.title !== undefined ? { title: parsed.data.title } : {}),
            ...(parsed.data.description !== undefined ? { description: parsed.data.description } : {}),
          },
          select: { id: true, slug: true, title: true, description: true, position: true },
        });

        await logAdminAction(session.user.id, 'album.edit', {
          targetType: 'Album',
          targetId: album.id,
          detail: album.title,
        });
        return Response.json({ album });
      },

      DELETE: async ({ request, params }) => {
        const session = await requireAdmin(request);
        if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });

        const ok = await deleteAlbum(params.id);
        if (!ok) return Response.json({ error: 'Album not found.' }, { status: 404 });

        await logAdminAction(session.user.id, 'album.delete', {
          targetType: 'Album',
          targetId: params.id,
        });
        return Response.json({ success: true });
      },
    },
  },
});
