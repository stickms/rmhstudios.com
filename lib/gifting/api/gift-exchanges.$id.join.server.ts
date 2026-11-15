import { apiRoute } from '@/lib/api/route.server';
import { defineHandler } from '@/lib/api/handler.server';
import { joinExchange, leaveExchange } from '@/lib/gifting/exchange.server';

/** POST joins an open exchange; DELETE leaves it. */
export const route = apiRoute('/api/gift-exchanges/$id/join', {
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
});
