import { createFileRoute } from '@tanstack/react-router';
import { implement } from '@/lib/api/implement.server';
import { reorderAlbumSlidesSchema } from '@/lib/admin/albums-schema';
import { adminAlbumReorder } from '@/lib/admin/albums.contract';
import { reorderSlides } from '@/lib/albums.admin.server';

/**
 * POST /api/admin/albums/$id/reorder — persist a new slide order within an
 * album. Body: { ids: string[] } (slide ids in desired order). Admin only.
 */
export const Route = createFileRoute('/api/admin/albums/$id/reorder')({
  server: {
    handlers: {
      POST: implement(
        adminAlbumReorder,
        {
          auth: 'admin',
          rateLimit: { policy: 'write', scope: 'user' },
          body: reorderAlbumSlidesSchema,
          invalid: () => Response.json({ error: 'Invalid order.' }, { status: 400 }),
        },
        async ({ params, body }) => {
          await reorderSlides(params.id, body.ids);
          return { success: true as const };
        },
      ),
    },
  },
});
