import { apiRoute } from '@/lib/api/route.server';
import { defineHandler } from '@/lib/api/handler.server';
import { verifyExchangeDraw } from '@/lib/gifting/exchange.server';

/** GET — re-run a disputed draw from its stored seed and compare with the stored pairings. */
export const route = apiRoute('/api/admin/gift-exchanges/$id/verify', {
  GET: defineHandler({ auth: 'admin', rateLimit: 'read' }, async ({ params }) => {
    const result = await verifyExchangeDraw(params.id);
    if (!result) return Response.json({ error: 'Not drawn' }, { status: 404 });
    return Response.json(result);
  }),
});
