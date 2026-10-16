import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { drawNow } from '@/lib/gifting/exchange.server';

/** POST — the organiser draws before the deadline. (The sweep job draws at the deadline.) */
export const Route = createFileRoute('/api/gift-exchanges/$id/draw')({
  server: {
    handlers: {
      POST: defineHandler(
        { rateLimit: { limit: 10, windowMs: 60_000, prefix: 'exchange-draw' } },
        async ({ userId, params }) => {
          const res = await drawNow(params.id, userId);
          if (!res.ok) return Response.json({ error: res.error }, { status: res.status });
          return Response.json({ ok: true });
        },
      ),
    },
  },
});
