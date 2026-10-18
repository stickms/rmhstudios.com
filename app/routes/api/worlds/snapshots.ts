import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { defineHandler } from '@/lib/api/handler.server';
import { SNAPSHOT_KINDS, publishSchema } from '@/lib/worlds/schema';
import { mySnapshot, publishSnapshot, unpublishSnapshot } from '@/lib/worlds/snapshots.server';

const kindQuery = z.object({ kind: z.enum(SNAPSHOT_KINDS) });

/**
 * GET    /api/worlds/snapshots?kind= — my published snapshot (code + postcards), or null.
 * POST   /api/worlds/snapshots — publish or refresh it (R6 island, R7 garden, R8 farm tour).
 * DELETE /api/worlds/snapshots?kind= — unpublish.
 */
export const Route = createFileRoute('/api/worlds/snapshots')({
  server: {
    handlers: {
      GET: defineHandler({ rateLimit: 'read', query: kindQuery }, async ({ userId, query }) =>
        Response.json(
          { snapshot: await mySnapshot(userId, query.kind) },
          { headers: { 'Cache-Control': 'private, no-store' } },
        ),
      ),
      POST: defineHandler(
        {
          rateLimit: { policy: 'write', limit: 30, windowMs: 60_000, prefix: 'world-publish' },
          body: publishSchema,
        },
        async ({ userId, body }) => {
          const res = await publishSnapshot(
            userId,
            body.kind,
            'payload' in body ? body.payload : null,
          );
          if (!res.ok) return Response.json({ error: res.error }, { status: res.status });
          return Response.json({ code: res.code, updatedAt: res.updatedAt });
        },
      ),
      DELETE: defineHandler({ rateLimit: 'write', query: kindQuery }, async ({ userId, query }) => {
        await unpublishSnapshot(userId, query.kind);
        return Response.json({ ok: true });
      }),
    },
  },
});
