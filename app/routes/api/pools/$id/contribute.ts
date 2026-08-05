import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { contribute, PoolError } from '@/lib/commerce/pools.server';
import { contributeSchema } from '@/lib/commerce/pools';

/**
 * POST /api/pools/:id/contribute — escrow coins into a pool.
 *
 * `idempotent: true` is load-bearing rather than decorative. A contribution is
 * the one pool action that is legitimately repeatable (chipping in twice is a
 * real intent), so the ledger cannot dedupe it from its own arguments the way a
 * theme purchase can. The request-level `Idempotency-Key` header is therefore
 * what makes a retried POST — a flaky connection, a double-tapped button —
 * replay the first response instead of escrowing a second time.
 */
export const Route = createFileRoute('/api/pools/$id/contribute')({
  server: {
    handlers: {
      POST: defineHandler(
        {
          rateLimit: { limit: 20, windowMs: 60_000, prefix: 'pool-contribute', scope: 'user' },
          body: contributeSchema,
          idempotent: true,
        },
        async ({ params, userId, body }) => {
          try {
            const result = await contribute(params.id, userId, body.coins);
            return Response.json({ ok: true, ...result });
          } catch (e) {
            if (e instanceof PoolError) {
              const status = e.message === 'NOT_FOUND' ? 404 : 400;
              return Response.json({ error: e.message }, { status });
            }
            throw e;
          }
        },
      ),
    },
  },
});
