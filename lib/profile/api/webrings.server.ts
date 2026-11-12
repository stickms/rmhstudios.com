import { apiRoute } from '@/lib/api/route.server';
import { defineHandler } from '@/lib/api/handler.server';
import { implement } from '@/lib/api/implement.server';
import { createRingApi } from '@/lib/profile/webrings.contract';
import { createRingSchema } from '@/lib/profile/webrings-schema';
import { createRing, listRings } from '@/lib/profile/webrings.server';

/**
 * GET  /api/webrings — the most popular rings plus the ones the caller is in (P6).
 * POST /api/webrings — start a ring; the creator is its first member.
 */
export const route = apiRoute('/api/webrings', {
  GET: defineHandler({ auth: 'optional', rateLimit: 'read' }, async ({ userId }) =>
    Response.json(await listRings(userId), {
      headers: { 'Cache-Control': 'private, no-store' },
    }),
  ),
  POST: implement(
    createRingApi,
    {
      rateLimit: { limit: 5, windowMs: 60 * 60_000, prefix: 'webring-create' },
      body: createRingSchema,
    },
    async ({ userId, body }) => {
      const result = await createRing(userId, body);
      if (!result.ok) return Response.json({ error: result.error }, { status: result.status });
      return Response.json({ ring: result.value }, { status: 201 });
    },
  ),
});
