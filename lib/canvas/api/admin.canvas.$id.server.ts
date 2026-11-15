import { apiRoute } from '@/lib/api/route.server';
import { defineHandler } from '@/lib/api/handler.server';
import { deleteCanvasEvent } from '@/lib/canvas/canvas.server';

/** DELETE /api/admin/canvas/:id — remove an event with its board and history. */
export const route = apiRoute('/api/admin/canvas/$id', {
  DELETE: defineHandler({ auth: 'admin', rateLimit: 'write' }, async ({ params }) =>
    (await deleteCanvasEvent(params.id))
      ? Response.json({ ok: true })
      : Response.json({ error: 'Not found' }, { status: 404 }),
  ),
});
