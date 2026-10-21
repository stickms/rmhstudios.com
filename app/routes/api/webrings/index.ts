import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { createRingSchema } from '@/lib/profile/webrings-schema';
import { createRing, listRings } from '@/lib/profile/webrings.server';

/**
 * GET  /api/webrings — the most popular rings plus the ones the caller is in (P6).
 * POST /api/webrings — start a ring; the creator is its first member.
 */
export const Route = createFileRoute('/api/webrings/')({
  server: {
    handlers: {
      GET: defineHandler({ auth: 'optional', rateLimit: 'read' }, async ({ userId }) =>
        Response.json(await listRings(userId), {
          headers: { 'Cache-Control': 'private, no-store' },
        }),
      ),
      POST: defineHandler(
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
    },
  },
});
