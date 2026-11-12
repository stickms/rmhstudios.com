import { apiRoute } from '@/lib/api/route.server';
import { defineHandler } from '@/lib/api/handler.server';
import { sendExchangeGiftSchema } from '@/lib/gifting/exchange-schema';
import { sendExchangeGift } from '@/lib/gifting/exchange.server';

/** POST — send the one coin gift to the member the caller drew (existing coin gifting). */
export const route = apiRoute('/api/gift-exchanges/$id/gift', {
  POST: defineHandler(
    {
      rateLimit: { limit: 10, windowMs: 60_000, prefix: 'exchange-gift' },
      body: sendExchangeGiftSchema,
    },
    async ({ userId, params, body }) => {
      const res = await sendExchangeGift(params.id, userId, body.amount, body.note);
      if (!res.ok) return Response.json({ error: res.error }, { status: res.status });
      return Response.json({ ok: true });
    },
  ),
});
