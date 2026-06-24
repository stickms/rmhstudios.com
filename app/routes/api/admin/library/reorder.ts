import { createFileRoute } from '@tanstack/react-router';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma.server';
import { logAdminAction } from '@/lib/admin-audit.server';
import { isSafeLibraryId } from '@/lib/library/keys';

/**
 * POST /api/admin/library/reorder — persist a manual book order. Body:
 *   { ids: string[] } — LibraryDocument ids in their desired order; each row's
 *   `position` is set to its index. Admin only.
 */
async function requireAdmin(request: Request) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session || !(session.user as { isAdmin?: boolean }).isAdmin) return null;
  return session;
}

export const Route = createFileRoute('/api/admin/library/reorder')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const session = await requireAdmin(request);
        if (!session) return Response.json({ error: 'Forbidden' }, { status: 403 });

        const body = (await request.json().catch(() => ({}))) as { ids?: unknown };
        const ids = Array.isArray(body.ids) ? body.ids.filter((x): x is string => typeof x === 'string') : [];
        if (ids.length === 0 || ids.length > 5000 || !ids.every(isSafeLibraryId)) {
          return Response.json({ error: 'Invalid order.' }, { status: 400 });
        }

        await prisma.$transaction(
          ids.map((id, index) =>
            prisma.libraryDocument.update({ where: { id }, data: { position: index } })
          )
        );
        await logAdminAction(session.user.id, 'library.reorder', {
          targetType: 'LibraryDocument',
          detail: `${ids.length} books`,
        });
        return Response.json({ ok: true });
      },
    },
  },
});
