import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { defineHandler } from '@/lib/api/handler.server';
import { deleteHunt, setHuntActive } from '@/lib/delight/hunt.server';

/** PATCH { active } switches a hunt on (turning any other off) or off; DELETE removes it and its progress. */
export const Route = createFileRoute('/api/admin/delight/hunts/$id/')({
  server: {
    handlers: {
      PATCH: defineHandler(
        { auth: 'admin', rateLimit: 'write', body: z.object({ active: z.boolean() }) },
        async ({ params, body }) =>
          (await setHuntActive(params.id, body.active))
            ? Response.json({ ok: true })
            : Response.json({ error: 'Not found' }, { status: 404 }),
      ),
      DELETE: defineHandler({ auth: 'admin', rateLimit: 'write' }, async ({ params }) => {
        await deleteHunt(params.id);
        return Response.json({ ok: true });
      }),
    },
  },
});
