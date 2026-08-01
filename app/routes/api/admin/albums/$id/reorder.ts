import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { z } from 'zod';
import { reorderSlides } from '@/lib/albums.admin.server';

/**
 * POST /api/admin/albums/$id/reorder — persist a new slide order within an
 * album. Body: { ids: string[] } (slide ids in desired order). Admin only.
 */
const schema = z.object({ ids: z.array(z.string()).max(5000) });

export const Route = createFileRoute('/api/admin/albums/$id/reorder')({
  server: {
    handlers: {
      POST: defineHandler({ auth: 'optional' }, async ({ request, params, session }) => {
        if (!session || !(session.user as { isAdmin?: boolean }).isAdmin) {
          return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }
        const body = await request.json().catch(() => null);
        const parsed = schema.safeParse(body);
        if (!parsed.success) return Response.json({ error: 'Invalid order.' }, { status: 400 });

        await reorderSlides(params.id, parsed.data.ids);
        return Response.json({ success: true });
      }),
    },
  },
});
