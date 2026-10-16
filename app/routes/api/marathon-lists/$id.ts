import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { marathonListSchema } from '@/lib/tools/schemas';
import { deleteMarathon, updateMarathon } from '@/lib/tools/tools.server';

/** PUT/DELETE /api/marathon-lists/:id — edit or remove one of the caller's own rows. */
export const Route = createFileRoute('/api/marathon-lists/$id')({
  server: {
    handlers: {
      PUT: defineHandler(
        { rateLimit: 'write', body: marathonListSchema },
        async ({ userId, params, body }) =>
          (await updateMarathon(userId, params.id, body))
            ? Response.json({ ok: true })
            : Response.json({ error: 'Not found' }, { status: 404 }),
      ),
      DELETE: defineHandler({ rateLimit: 'write' }, async ({ userId, params }) =>
        (await deleteMarathon(userId, params.id))
          ? Response.json({ ok: true })
          : Response.json({ error: 'Not found' }, { status: 404 }),
      ),
    },
  },
});
