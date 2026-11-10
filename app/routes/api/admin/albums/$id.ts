import { createFileRoute } from '@tanstack/react-router';
import { implement } from '@/lib/api/implement.server';
import { patchAlbumSchema } from '@/lib/admin/albums-schema';
import { adminAlbumDelete, adminAlbumPatch } from '@/lib/admin/albums.contract';
import { prisma } from '@/lib/prisma.server';
import { logAdminAction } from '@/lib/admin-audit.server';
import { deleteAlbum } from '@/lib/albums.admin.server';

/**
 * PATCH  /api/admin/albums/$id — edit album title/description. Admin only.
 * DELETE /api/admin/albums/$id — delete album, slides, and stored objects.
 */

const NOTHING = () => Response.json({ error: 'Nothing to update.' }, { status: 400 });

export const Route = createFileRoute('/api/admin/albums/$id')({
  server: {
    handlers: {
      PATCH: implement(
        adminAlbumPatch,
        { auth: 'admin', body: patchAlbumSchema, invalid: NOTHING },
        async ({ userId, body, params }) => {
          if (body.title === undefined && body.description === undefined) return NOTHING();

          const exists = await prisma.album.findUnique({
            where: { id: params.id },
            select: { id: true },
          });
          if (!exists) return Response.json({ error: 'Album not found.' }, { status: 404 });

          const album = await prisma.album.update({
            where: { id: params.id },
            data: {
              ...(body.title !== undefined ? { title: body.title } : {}),
              ...(body.description !== undefined ? { description: body.description } : {}),
            },
            select: { id: true, slug: true, title: true, description: true, position: true },
          });

          await logAdminAction(userId, 'album.edit', {
            targetType: 'Album',
            targetId: album.id,
            detail: album.title,
          });
          return { album };
        },
      ),

      DELETE: implement(adminAlbumDelete, { auth: 'admin' }, async ({ userId, params }) => {
        const ok = await deleteAlbum(params.id);
        if (!ok) return Response.json({ error: 'Album not found.' }, { status: 404 });

        await logAdminAction(userId, 'album.delete', {
          targetType: 'Album',
          targetId: params.id,
        });
        return { success: true as const };
      }),
    },
  },
});
