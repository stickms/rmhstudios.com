import { apiRoute } from '@/lib/api/route.server';
import { defineHandler } from '@/lib/api/handler.server';
import { huntInputSchema } from '@/lib/delight/schema';
import { createHunt, listHunts } from '@/lib/delight/hunt.server';

/** GET/POST /api/admin/delight/hunts — admin-defined clue chains (answers are stored normalised). */
export const route = apiRoute('/api/admin/delight/hunts', {
  GET: defineHandler({ auth: 'admin', rateLimit: 'read' }, async () =>
    Response.json({ hunts: await listHunts() }),
  ),
  POST: defineHandler(
    { auth: 'admin', rateLimit: 'write', body: huntInputSchema },
    async ({ body }) => Response.json(await createHunt(body), { status: 201 }),
  ),
});
