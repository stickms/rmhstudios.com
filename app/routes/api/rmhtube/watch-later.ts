import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { defineHandler } from '@/lib/api/handler.server';
import { mediaUrlSchema } from '@/lib/rmhtube/party';
import { addWatchLater, deleteWatchLater, listWatchLater } from '@/lib/rmhtube/watch.server';

/** RMHTube watch later (F17): the caller's personal queue. */
export const Route = createFileRoute('/api/rmhtube/watch-later')({
  server: {
    handlers: {
      GET: defineHandler({ rateLimit: 'read' }, async ({ userId }) =>
        Response.json(
          { items: await listWatchLater(userId) },
          { headers: { 'Cache-Control': 'private, no-store' } },
        ),
      ),
      POST: defineHandler(
        {
          rateLimit: 'write',
          body: z.object({ url: mediaUrlSchema, title: z.string().trim().max(256).optional() }),
        },
        async ({ userId, body }) => {
          const fallback = new URL(body.url).hostname;
          const item = await addWatchLater(userId, body.url, body.title || fallback);
          return Response.json({ item }, { status: 201 });
        },
      ),
      DELETE: defineHandler(
        { rateLimit: 'write', query: z.object({ id: z.string().min(1).max(40) }) },
        async ({ userId, query }) => {
          await deleteWatchLater(userId, query.id);
          return Response.json({ ok: true });
        },
      ),
    },
  },
});
