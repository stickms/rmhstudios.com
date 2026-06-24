import { createFileRoute } from '@tanstack/react-router';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma.server';
import { deleteObject } from '@/lib/storage/s3.server';
import { logAdminAction } from '@/lib/admin-audit.server';
import { isSafeLibraryId } from '@/lib/library/keys';

/**
 * Admin management of a single library book (LibraryDocument row).
 *   PATCH  /api/admin/library/$id — edit metadata, curate/uncurate, hide/unhide,
 *          clear a report.
 *   DELETE /api/admin/library/$id — remove the book and its stored files.
 *
 * Only DB-backed books are addressable; static catalog books must be migrated to
 * object storage first (they have no id until then).
 */
const TITLE_MAX = 200;
const DESCRIPTION_MAX = 1000;

async function requireAdmin(request: Request) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session || !(session.user as { isAdmin?: boolean }).isAdmin) return null;
  return session;
}

export const Route = createFileRoute('/api/admin/library/$id')({
  server: {
    handlers: {
      PATCH: async ({ request, params }) => {
        const session = await requireAdmin(request);
        if (!session) return Response.json({ error: 'Forbidden' }, { status: 403 });
        if (!isSafeLibraryId(params.id)) return Response.json({ error: 'Not found.' }, { status: 404 });

        const doc = await prisma.libraryDocument.findUnique({ where: { id: params.id } });
        if (!doc) return Response.json({ error: 'Not found.' }, { status: 404 });

        const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
        const data: {
          title?: string;
          description?: string;
          official?: boolean;
          hidden?: boolean;
          reported?: boolean;
        } = {};

        if (typeof body.title === 'string') {
          const title = body.title.trim();
          if (!title) return Response.json({ error: 'A title is required.' }, { status: 422 });
          if (title.length > TITLE_MAX) {
            return Response.json({ error: `Title must be ${TITLE_MAX} characters or fewer.` }, { status: 422 });
          }
          data.title = title;
        }
        if (typeof body.description === 'string') {
          if (body.description.length > DESCRIPTION_MAX) {
            return Response.json(
              { error: `Description must be ${DESCRIPTION_MAX} characters or fewer.` },
              { status: 422 }
            );
          }
          data.description = body.description.trim();
        }
        if (typeof body.official === 'boolean') data.official = body.official;
        if (typeof body.hidden === 'boolean') data.hidden = body.hidden;
        if (typeof body.reported === 'boolean') data.reported = body.reported;

        if (Object.keys(data).length === 0) {
          return Response.json({ error: 'Nothing to update.' }, { status: 400 });
        }

        const updated = await prisma.libraryDocument.update({ where: { id: doc.id }, data });
        await logAdminAction(session.user.id, 'library.edit', {
          targetType: 'LibraryDocument',
          targetId: doc.id,
          detail: Object.keys(data).join(','),
        });
        return Response.json({ ok: true, slug: updated.slug });
      },

      DELETE: async ({ request, params }) => {
        const session = await requireAdmin(request);
        if (!session) return Response.json({ error: 'Forbidden' }, { status: 403 });
        if (!isSafeLibraryId(params.id)) return Response.json({ error: 'Not found.' }, { status: 404 });

        const doc = await prisma.libraryDocument.findUnique({ where: { id: params.id } });
        if (!doc) return Response.json({ error: 'Not found.' }, { status: 404 });

        await deleteObject(doc.pdfKey).catch(() => {});
        if (doc.coverKey) await deleteObject(doc.coverKey).catch(() => {});
        await prisma.libraryDocument.delete({ where: { id: doc.id } });
        await logAdminAction(session.user.id, 'library.delete', {
          targetType: 'LibraryDocument',
          targetId: doc.id,
          detail: doc.title.slice(0, 120),
        });
        return Response.json({ ok: true });
      },
    },
  },
});
