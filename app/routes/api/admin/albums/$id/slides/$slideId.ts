import { createFileRoute } from '@tanstack/react-router';
import { implement } from '@/lib/api/implement.server';
import * as C from '@/lib/admin/admin-ops.contract';
import { logAdminAction } from '@/lib/admin-audit.server';
import { deleteSlide } from '@/lib/albums.admin.server';

/**
 * DELETE /api/admin/albums/$id/slides/$slideId — remove a slide and its stored
 * objects. Admin only.
 */
export const Route = createFileRoute('/api/admin/albums/$id/slides/$slideId')({
  server: {
    handlers: {
      DELETE: implement(
        C.deleteAdminAlbumSlideApi,
        { auth: 'admin', rateLimit: { policy: 'write', scope: 'user' } },
        async ({ params, session }) => {
          const ok = await deleteSlide(params.id, params.slideId);
          if (!ok) return Response.json({ error: 'Slide not found.' }, { status: 404 });

          await logAdminAction(session.user.id, 'album.slide-delete', {
            targetType: 'AlbumSlide',
            targetId: params.slideId,
          });
          return Response.json({ success: true });
        },
      ),
    },
  },
});
