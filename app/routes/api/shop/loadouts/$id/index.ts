import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { deleteLoadout, LoadoutError } from '@/lib/shop/loadouts.server';

/** DELETE /api/shop/loadouts/:id — remove a saved loadout. */
export const Route = createFileRoute('/api/shop/loadouts/$id/')({
  server: {
    handlers: {
      DELETE: defineHandler({ rateLimit: 'write' }, async ({ userId, params }) => {
        try {
          await deleteLoadout(userId, params.id);
          return Response.json({ ok: true });
        } catch (e) {
          if (e instanceof LoadoutError) return Response.json({ error: e.code }, { status: 404 });
          throw e;
        }
      }),
    },
  },
});
