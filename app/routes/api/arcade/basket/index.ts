import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { utcDayKey } from '@/lib/arcade/seeded';
import { basketFor } from '@/lib/arcade/basket';
import { getBasketBoard, getMyBasket } from '@/lib/arcade/basket.server';

/** GET /api/arcade/basket — today's Laundry Sort basket, its board, and the caller's attempt. */
export const Route = createFileRoute('/api/arcade/basket/')({
  server: {
    handlers: {
      GET: defineHandler({ auth: 'optional', rateLimit: 'read' }, async ({ userId }) => {
        const basket = basketFor(utcDayKey());
        const [board, mine] = await Promise.all([
          getBasketBoard(basket.day),
          userId ? getMyBasket(userId, basket.day) : Promise.resolve(null),
        ]);
        return Response.json(
          { basket, board: board.map((r) => ({ ...r, isMe: r.userId === userId })), mine },
          { headers: { 'Cache-Control': 'private, no-store' } },
        );
      }),
    },
  },
});
