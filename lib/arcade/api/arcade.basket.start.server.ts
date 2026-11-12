import { apiRoute } from '@/lib/api/route.server';
import { defineHandler } from '@/lib/api/handler.server';
import { utcDayKey } from '@/lib/arcade/seeded';
import { basketFor } from '@/lib/arcade/basket';
import { startBasket } from '@/lib/arcade/basket.server';

/** POST /api/arcade/basket/start — claim today's one counted basket attempt. */
export const route = apiRoute('/api/arcade/basket/start', {
  POST: defineHandler({ rateLimit: 'write' }, async ({ userId }) => {
    const { counted } = await startBasket(userId);
    return Response.json({ counted, basket: basketFor(utcDayKey()) });
  }),
});
