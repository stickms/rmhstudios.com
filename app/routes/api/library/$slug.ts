import { createFileRoute } from '@tanstack/react-router';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma.server';
import { deleteObject } from '@/lib/storage/s3.server';

/**
 * DELETE /api/library/$slug — remove an uploaded book (owner or admin only).
 * POST   /api/library/$slug — report an uploaded book (any signed-in user).
 *
 * Only uploaded books (LibraryDocument rows) are addressable here; the static
 * catalog is immutable.
 */
export const Route = createFileRoute('/api/library/$slug')({
  server: {
    handlers: {
      DELETE: async ({ request, params }) => {
        const session = await auth.api.getSession({ headers: request.headers });
        if (!session) {
          return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }
        const doc = await prisma.libraryDocument.findUnique({ where: { slug: params.slug } });
        if (!doc) {
          return Response.json({ error: 'Not found.' }, { status: 404 });
        }
        const isAdmin = Boolean((session.user as { isAdmin?: boolean }).isAdmin);
        const isOwner = doc.uploadedByUserId === session.user.id;
        if (!isAdmin && !isOwner) {
          return Response.json({ error: 'You can only delete your own uploads.' }, { status: 403 });
        }
        await deleteObject(doc.pdfKey).catch(() => {});
        if (doc.coverKey) await deleteObject(doc.coverKey).catch(() => {});
        await prisma.libraryDocument.delete({ where: { id: doc.id } });
        return Response.json({ ok: true });
      },

      POST: async ({ request, params }) => {
        const session = await auth.api.getSession({ headers: request.headers });
        if (!session) {
          return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }
        const doc = await prisma.libraryDocument.findUnique({
          where: { slug: params.slug },
          select: { id: true },
        });
        if (!doc) {
          return Response.json({ error: 'Not found.' }, { status: 404 });
        }
        await prisma.libraryDocument.update({ where: { id: doc.id }, data: { reported: true } });
        return Response.json({ ok: true });
      },
    },
  },
});
