import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { prisma } from '@/lib/prisma.server';
import {
  advocateSchema,
  devilsAdvocate,
  heldSide,
  visibleMarket,
} from '@/lib/forecasting/forecasting.server';

/** POST /api/predictions/$id/devils-advocate — strongest case for the side the caller does not hold (I3). */
export const Route = createFileRoute('/api/predictions/$id/devils-advocate')({
  server: {
    handlers: {
      POST: defineHandler(
        { rateLimit: 'ai', body: advocateSchema },
        async ({ params, userId, body }) => {
          const market = await visibleMarket(params.id, userId);
          if (!market) return Response.json({ error: 'Not found' }, { status: 404 });
          const pos = await prisma.predictionPosition.findUnique({
            where: { predictionId_userId: { predictionId: market.id, userId } },
            select: { yesShares: true, noShares: true },
          });
          if (heldSide(pos).side === body.side) {
            return Response.json({ error: 'You already hold that side' }, { status: 400 });
          }
          const argument = await devilsAdvocate(market, body.side).catch(() => null);
          if (!argument) return Response.json({ error: 'Unavailable right now' }, { status: 503 });
          return Response.json({ argument, side: body.side });
        },
      ),
    },
  },
});
