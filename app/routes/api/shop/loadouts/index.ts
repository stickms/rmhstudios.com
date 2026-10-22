import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { saveLoadoutSchema } from '@/lib/shop/loadouts';
import { listLoadouts, LoadoutError, saveCurrentLoadout } from '@/lib/shop/loadouts.server';

/**
 * GET  /api/shop/loadouts — the caller's saved loadouts.
 * POST /api/shop/loadouts { name } — save what is equipped right now under a name (C6).
 */
export const Route = createFileRoute('/api/shop/loadouts/')({
  server: {
    handlers: {
      GET: defineHandler({ rateLimit: 'read' }, async ({ userId }) =>
        Response.json(
          { loadouts: await listLoadouts(userId) },
          { headers: { 'Cache-Control': 'private, no-store' } },
        ),
      ),
      POST: defineHandler(
        { rateLimit: 'write', body: saveLoadoutSchema },
        async ({ userId, body }) => {
          try {
            const id = await saveCurrentLoadout(userId, body.name);
            return Response.json({ id }, { status: 201 });
          } catch (e) {
            if (e instanceof LoadoutError) return Response.json({ error: e.code }, { status: 400 });
            throw e;
          }
        },
      ),
    },
  },
});
