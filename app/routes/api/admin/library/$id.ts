import { createFileRoute } from '@tanstack/react-router';
import { implement } from '@/lib/api/implement.server';
import { adminBookPatchSchema } from '@/lib/library/admin-library-schema';
import { adminLibraryDeleteApi, adminLibraryPatchApi } from '@/lib/library/admin-library.contract';
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

export const Route = createFileRoute('/api/admin/library/$id')({
  server: {
    handlers: {
      PATCH: implement(
        adminLibraryPatchApi,
        {
          auth: 'admin',
          body: adminBookPatchSchema,
          allowEmptyBody: true,
          invalid: () => Response.json({ error: 'Nothing to update.' }, { status: 400 }),
        },
        async ({ userId, params, body }) => {
        if (!isSafeLibraryId(params.id)) return Response.json({ error: 'Not found.' }, { status: 404 });

        const doc = await prisma.libraryDocument.findUnique({ where: { id: params.id } });
        if (!doc) return Response.json({ error: 'Not found.' }, { status: 404 });

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
        await logAdminAction(userId, 'library.edit', {
          targetType: 'LibraryDocument',
          targetId: doc.id,
          detail: Object.keys(data).join(','),
        });
        return { ok: true as const, slug: updated.slug };
        },
      ),

      DELETE: implement(adminLibraryDeleteApi, { auth: 'admin' }, async ({ userId, params }) => {
        if (!isSafeLibraryId(params.id)) return Response.json({ error: 'Not found.' }, { status: 404 });

        const doc = await prisma.libraryDocument.findUnique({ where: { id: params.id } });
        if (!doc) return Response.json({ error: 'Not found.' }, { status: 404 });

        await deleteObject(doc.pdfKey).catch(() => {});
        if (doc.coverKey) await deleteObject(doc.coverKey).catch(() => {});
        await prisma.libraryDocument.delete({ where: { id: doc.id } });
        await logAdminAction(userId, 'library.delete', {
          targetType: 'LibraryDocument',
          targetId: doc.id,
          detail: doc.title.slice(0, 120),
        });
        return { ok: true as const };
      }),
    },
  },
});
