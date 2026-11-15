import { apiRoute } from '@/lib/api/route.server';
import { defineHandler } from '@/lib/api/handler.server';
import { removeNomination } from '@/lib/delight/photo.server';

/** DELETE /api/photo-of-the-day/:id — the nominator, or an admin, takes a photo down. */
export const route = apiRoute('/api/photo-of-the-day/$id', {
  DELETE: defineHandler({ rateLimit: 'write' }, async ({ userId, isAdmin, params }) => {
    const ok = await removeNomination(params.id, userId, isAdmin);
    return ok
      ? Response.json({ ok: true })
      : Response.json({ error: 'Not found' }, { status: 404 });
  }),
});
