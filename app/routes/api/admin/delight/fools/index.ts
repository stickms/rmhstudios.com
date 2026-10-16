import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { defineHandler } from '@/lib/api/handler.server';
import { getDelightConfig, setFools } from '@/lib/delight/config.server';

/** GET/POST /api/admin/delight/fools — the April Fools flag (off by default). */
export const Route = createFileRoute('/api/admin/delight/fools/')({
  server: {
    handlers: {
      GET: defineHandler({ auth: 'admin', rateLimit: 'read' }, async () =>
        Response.json({ fools: (await getDelightConfig()).fools }),
      ),
      POST: defineHandler(
        { auth: 'admin', rateLimit: 'write', body: z.object({ on: z.boolean() }) },
        async ({ body }) => {
          await setFools(body.on);
          return Response.json({ fools: body.on });
        },
      ),
    },
  },
});
