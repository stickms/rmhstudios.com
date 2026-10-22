import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { createPackSchema } from '@/lib/party/packs-schema';
import { createPack, listPacks } from '@/lib/party/packs.server';

/**
 * GET  /api/rmhbox/packs — featured shelf, newest community packs, the caller's own.
 * POST /api/rmhbox/packs — author a prompt pack (R2); returns its share code.
 */
export const Route = createFileRoute('/api/rmhbox/packs/')({
  server: {
    handlers: {
      GET: defineHandler({ auth: 'optional', rateLimit: 'read' }, async ({ userId, isAdmin }) => {
        const data = await listPacks(userId, isAdmin);
        return Response.json(data, { headers: { 'Cache-Control': 'private, no-store' } });
      }),
      POST: defineHandler(
        { rateLimit: 'write', body: createPackSchema },
        async ({ userId, body }) => {
          const r = await createPack(userId, body);
          if (!r.ok) return Response.json({ error: r.error }, { status: r.status });
          return Response.json({ pack: r.pack }, { status: 201 });
        },
      ),
    },
  },
});
