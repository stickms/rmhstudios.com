import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { huntInputSchema } from '@/lib/delight/schema';
import { createHunt, listHunts } from '@/lib/delight/hunt.server';

/** GET/POST /api/admin/delight/hunts — admin-defined clue chains (answers are stored normalised). */
export const Route = createFileRoute('/api/admin/delight/hunts/')({
  server: {
    handlers: {
      GET: defineHandler({ auth: 'admin', rateLimit: 'read' }, async () =>
        Response.json({ hunts: await listHunts() }),
      ),
      POST: defineHandler(
        { auth: 'admin', rateLimit: 'write', body: huntInputSchema },
        async ({ body }) => Response.json(await createHunt(body), { status: 201 }),
      ),
    },
  },
});
