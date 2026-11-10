import { createFileRoute } from '@tanstack/react-router';
import { implement } from '@/lib/api/implement.server';
import { adminReorderBooksSchema } from '@/lib/library/admin-library-schema';
import { adminLibraryReorderApi } from '@/lib/library/admin-library.contract';
import { prisma } from '@/lib/prisma.server';
import { logAdminAction } from '@/lib/admin-audit.server';
import { isSafeLibraryId } from '@/lib/library/keys';

/**
 * POST /api/admin/library/reorder — persist a manual book order. Body:
 *   { ids: string[] } — LibraryDocument ids in their desired order; each row's
 *   `position` is set to its index. Admin only.
 */
export const Route = createFileRoute('/api/admin/library/reorder')({
  server: {
    handlers: {
      POST: implement(
        adminLibraryReorderApi,
        {
          auth: 'admin',
          body: adminReorderBooksSchema,
          invalid: () => Response.json({ error: 'Invalid order.' }, { status: 400 }),
        },
        async ({ userId, body }) => {
        const { ids } = body;
        if (ids.length === 0 || ids.length > 5000 || !ids.every(isSafeLibraryId)) {
          return Response.json({ error: 'Invalid order.' }, { status: 400 });
        }

        await prisma.$transaction(
          ids.map((id, index) =>
            prisma.libraryDocument.update({ where: { id }, data: { position: index } })
          )
        );
        await logAdminAction(userId, 'library.reorder', {
          targetType: 'LibraryDocument',
          detail: `${ids.length} books`,
        });
        return { ok: true as const };
        },
      ),
    },
  },
});
