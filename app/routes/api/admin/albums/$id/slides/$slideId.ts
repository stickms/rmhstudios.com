import { createFileRoute } from '@tanstack/react-router';
import { auth } from '@/lib/auth';
import { logAdminAction } from '@/lib/admin-audit.server';
import { deleteSlide } from '@/lib/albums.admin.server';

/**
 * DELETE /api/admin/albums/$id/slides/$slideId — remove a slide and its stored
 * objects. Admin only.
 */
export const Route = createFileRoute('/api/admin/albums/$id/slides/$slideId')({
  server: {
    handlers: {
      DELETE: async ({ request, params }) => {
        const session = await auth.api.getSession({ headers: request.headers });
        if (!session || !(session.user as { isAdmin?: boolean }).isAdmin) {
          return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const ok = await deleteSlide(params.id, params.slideId);
        if (!ok) return Response.json({ error: 'Slide not found.' }, { status: 404 });

        await logAdminAction(session.user.id, 'album.slide-delete', {
          targetType: 'AlbumSlide',
          targetId: params.slideId,
        });
        return Response.json({ success: true });
      },
    },
  },
});
