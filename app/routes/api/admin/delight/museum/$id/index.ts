import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { eraSchema } from '@/lib/delight/schema';
import { deleteEra, updateEra } from '@/lib/delight/museum.server';

/** PUT replaces a site era; DELETE removes it. */
export const Route = createFileRoute('/api/admin/delight/museum/$id/')({
  server: {
    handlers: {
      PUT: defineHandler(
        { auth: 'admin', rateLimit: 'write', body: eraSchema },
        async ({ params, body }) =>
          (await updateEra(params.id, body))
            ? Response.json({ ok: true })
            : Response.json({ error: 'Not found' }, { status: 404 }),
      ),
      DELETE: defineHandler({ auth: 'admin', rateLimit: 'write' }, async ({ params }) => {
        await deleteEra(params.id);
        return Response.json({ ok: true });
      }),
    },
  },
});
