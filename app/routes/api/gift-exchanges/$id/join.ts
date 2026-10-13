import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { joinExchange, leaveExchange } from '@/lib/gifting/exchange.server';

/** POST joins an open exchange; DELETE leaves it. */
export const Route = createFileRoute('/api/gift-exchanges/$id/join')({
  server: {
    handlers: {
      POST: defineHandler({ rateLimit: 'write' }, async ({ userId, params }) => {
        const res = await joinExchange(params.id, userId);
        if (!res.ok) return Response.json({ error: res.error }, { status: res.status });
        return Response.json({ ok: true });
      }),
      DELETE: defineHandler({ rateLimit: 'write' }, async ({ userId, params }) => {
        const res = await leaveExchange(params.id, userId);
        if (!res.ok) return Response.json({ error: res.error }, { status: res.status });
        return Response.json({ ok: true });
      }),
    },
  },
});
