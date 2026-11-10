import { createFileRoute } from '@tanstack/react-router';
import { implement } from '@/lib/api/implement.server';
import { adminPredictionQueueApi } from '@/lib/predictions/predictions.contract';
import { prisma } from '@/lib/prisma.server';
import { serializeMarket } from '@/lib/predictions/predictions.server';

/**
 * GET /api/admin/predictions — moderation queue. Returns PENDING submissions and
 * OPEN markets (so admins can approve/deny and resolve from one place).
 */
export const Route = createFileRoute('/api/admin/predictions/')({
  server: {
    handlers: {
      GET: implement(adminPredictionQueueApi, { auth: 'admin' }, async () => {
        const rows = await prisma.prediction.findMany({
          where: { status: { in: ['PENDING', 'OPEN'] } },
          orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
          take: 200,
          include: {
            creator: { select: { id: true, name: true, handle: true, image: true } },
          },
        });
        const markets = rows.map((r) => serializeMarket(r));
        return {
          pending: markets.filter((m) => m.status === 'PENDING'),
          open: markets.filter((m) => m.status === 'OPEN'),
        };
      }),
    },
  },
});
