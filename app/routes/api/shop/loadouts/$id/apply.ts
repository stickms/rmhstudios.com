import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { applyLoadout, LoadoutError } from '@/lib/shop/loadouts.server';

/** POST /api/shop/loadouts/:id/apply — equip a saved loadout in one step (C6). */
export const Route = createFileRoute('/api/shop/loadouts/$id/apply')({
  server: {
    handlers: {
      POST: defineHandler(
        { rateLimit: 'write', allowEmptyBody: true },
        async ({ userId, params }) => {
          try {
            return Response.json({ ok: true, ...(await applyLoadout(userId, params.id)) });
          } catch (e) {
            if (e instanceof LoadoutError) {
              return Response.json(
                { error: e.code },
                { status: e.code === 'NOT_FOUND' ? 404 : 400 },
              );
            }
            throw e;
          }
        },
      ),
    },
  },
});
