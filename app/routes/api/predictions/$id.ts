import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { prisma } from '@/lib/prisma.server';
import { serializeMarket } from '@/lib/predictions/predictions.server';

/** GET /api/predictions/$id — single market detail (with viewer position). */
export const Route = createFileRoute('/api/predictions/$id')({
  server: {
    handlers: {
      GET: defineHandler({ auth: 'optional' }, async ({ params, session }) => {
        const viewerId = session?.user?.id;
        const market = await prisma.prediction.findUnique({
          where: { id: params.id },
          include: {
            creator: { select: { id: true, name: true, handle: true, image: true } },
            positions: viewerId ? { where: { userId: viewerId } } : false,
          },
        });
        if (!market || market.status === 'PENDING' || market.status === 'DENIED') {
          // Don't leak unapproved/denied submissions to non-creators.
          if (!market || market.creatorId !== viewerId) {
            return Response.json({ error: 'Not found' }, { status: 404 });
          }
        }
        return Response.json({ market: serializeMarket(market, viewerId) });
      }),
    },
  },
});
