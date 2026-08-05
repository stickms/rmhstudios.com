import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { createPool, listOpenPools, PoolError } from '@/lib/commerce/pools.server';
import { createPoolSchema } from '@/lib/commerce/pools';

/** Map a domain error to a status; anything else bubbles to the wrapper's 500. */
function poolErrorResponse(e: unknown): Response {
  if (e instanceof PoolError) {
    const status = e.message === 'NOT_FOUND' ? 404 : 400;
    return Response.json({ error: e.message }, { status });
  }
  throw e;
}

export const Route = createFileRoute('/api/pools/')({
  server: {
    handlers: {
      /** GET /api/pools — open pools accepting contributions. */
      GET: defineHandler({ auth: 'optional', rateLimit: 'read' }, async () =>
        Response.json({ pools: await listOpenPools() }),
      ),

      /** POST /api/pools — start a pool. Creating one escrows nothing yet. */
      POST: defineHandler(
        { rateLimit: { limit: 10, windowMs: 60_000, prefix: 'pool-create', scope: 'user' }, body: createPoolSchema },
        async ({ userId, body }) => {
          try {
            return Response.json({ ok: true, id: await createPool(userId, body) });
          } catch (e) {
            return poolErrorResponse(e);
          }
        },
      ),
    },
  },
});
