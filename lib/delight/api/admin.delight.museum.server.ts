import { apiRoute } from '@/lib/api/route.server';
import { defineHandler } from '@/lib/api/handler.server';
import { eraSchema } from '@/lib/delight/schema';
import { createEra } from '@/lib/delight/museum.server';

/** POST /api/admin/delight/museum — add a site era (the screenshot is uploaded first via /api/rmharks/image). */
export const route = apiRoute('/api/admin/delight/museum', {
  POST: defineHandler({ auth: 'admin', rateLimit: 'write', body: eraSchema }, async ({ body }) =>
    Response.json(await createEra(body), { status: 201 }),
  ),
});
