import { createFileRoute } from '@tanstack/react-router';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma.server';
import { serializeMarket } from '@/lib/predictions/predictions.server';

/** GET /api/predictions/$id — single market detail (with viewer position). */
export const Route = createFileRoute('/api/predictions/$id')({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        try {
          const session = await auth.api.getSession({ headers: request.headers });
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
            if (!market || (market.creatorId !== viewerId)) {
              return Response.json({ error: 'Not found' }, { status: 404 });
            }
          }
          return Response.json({ market: serializeMarket(market, viewerId) });
        } catch (error) {
          console.error('Prediction detail error:', error);
          return Response.json({ error: 'Internal Server Error' }, { status: 500 });
        }
      },
    },
  },
});
