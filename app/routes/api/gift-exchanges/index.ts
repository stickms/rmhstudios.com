import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { createExchangeSchema } from '@/lib/gifting/exchange-schema';
import { createExchange, listMyExchanges } from '@/lib/gifting/exchange.server';

/** Gift / mixtape exchanges (G3, F2): the caller's list, and create. */
export const Route = createFileRoute('/api/gift-exchanges/')({
  server: {
    handlers: {
      GET: defineHandler({ rateLimit: 'read' }, async ({ userId }) =>
        Response.json(
          { exchanges: await listMyExchanges(userId) },
          { headers: { 'Cache-Control': 'private, no-store' } },
        ),
      ),
      POST: defineHandler(
        {
          rateLimit: { limit: 10, windowMs: 3_600_000, prefix: 'exchange-create' },
          body: createExchangeSchema,
        },
        async ({ userId, body }) => {
          const res = await createExchange(userId, body);
          if (!res.ok) return Response.json({ error: res.error }, { status: res.status });
          return Response.json({ id: res.id }, { status: 201 });
        },
      ),
    },
  },
});
