import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { removeNomination } from '@/lib/delight/photo.server';

/** DELETE /api/photo-of-the-day/:id — the nominator, or an admin, takes a photo down. */
export const Route = createFileRoute('/api/photo-of-the-day/$id/')({
  server: {
    handlers: {
      DELETE: defineHandler({ rateLimit: 'write' }, async ({ userId, isAdmin, params }) => {
        const ok = await removeNomination(params.id, userId, isAdmin);
        return ok
          ? Response.json({ ok: true })
          : Response.json({ error: 'Not found' }, { status: 404 });
      }),
    },
  },
});
