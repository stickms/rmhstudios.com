import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { defineHandler } from '@/lib/api/handler.server';
import { setShelfSchema } from '@/lib/reading/schema';
import { getMyShelves, removeShelf, setShelf } from '@/lib/reading/shelves.server';

/**
 * GET    /api/reading/shelves — the caller's shelves and per-shelf privacy.
 * PUT    /api/reading/shelves — put a library book on a shelf (moves it if already shelved).
 * DELETE /api/reading/shelves?slug= — take it off the shelves.
 */
const removeQuery = z.object({ slug: z.string().min(1).max(200) });

export const Route = createFileRoute('/api/reading/shelves/')({
  server: {
    handlers: {
      GET: defineHandler({ rateLimit: 'read' }, async ({ userId }) => {
        return Response.json(await getMyShelves(userId), {
          headers: { 'Cache-Control': 'private, no-store' },
        });
      }),
      PUT: defineHandler({ rateLimit: 'write', body: setShelfSchema }, async ({ userId, body }) => {
        const result = await setShelf(userId, body);
        if (!result.ok) return Response.json({ error: result.error }, { status: result.status });
        return Response.json({ entry: result.entry });
      }),
      DELETE: defineHandler(
        { rateLimit: 'write', query: removeQuery },
        async ({ userId, query }) => {
          await removeShelf(userId, query.slug);
          return Response.json({ ok: true });
        },
      ),
    },
  },
});
