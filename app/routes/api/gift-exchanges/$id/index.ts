import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { cancelExchange, getExchange } from '@/lib/gifting/exchange.server';

/** One exchange, as the caller may see it (own recipient only, until the reveal). DELETE cancels. */
export const Route = createFileRoute('/api/gift-exchanges/$id/')({
  server: {
    handlers: {
      GET: defineHandler({ rateLimit: 'read' }, async ({ userId, params }) => {
        const view = await getExchange(params.id, userId);
        if (!view) return Response.json({ error: 'Not found' }, { status: 404 });
        return Response.json(view, { headers: { 'Cache-Control': 'private, no-store' } });
      }),
      DELETE: defineHandler({ rateLimit: 'write' }, async ({ userId, params }) => {
        const res = await cancelExchange(params.id, userId);
        if (!res.ok) return Response.json({ error: res.error }, { status: res.status });
        return Response.json({ ok: true });
      }),
    },
  },
});
