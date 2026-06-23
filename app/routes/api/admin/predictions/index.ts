import { createFileRoute } from '@tanstack/react-router';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma.server';
import { serializeMarket } from '@/lib/predictions/predictions.server';

async function requireAdmin(request: Request) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session || !(session.user as { isAdmin?: boolean }).isAdmin) return null;
  return session;
}

/**
 * GET /api/admin/predictions — moderation queue. Returns PENDING submissions and
 * OPEN markets (so admins can approve/deny and resolve from one place).
 */
export const Route = createFileRoute('/api/admin/predictions/')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const session = await requireAdmin(request);
        if (!session) return Response.json({ error: 'Forbidden' }, { status: 403 });

        const rows = await prisma.prediction.findMany({
          where: { status: { in: ['PENDING', 'OPEN'] } },
          orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
          take: 200,
          include: {
            creator: { select: { id: true, name: true, handle: true, image: true } },
          },
        });
        const markets = rows.map((r) => serializeMarket(r));
        return Response.json({
          pending: markets.filter((m) => m.status === 'PENDING'),
          open: markets.filter((m) => m.status === 'OPEN'),
        });
      },
    },
  },
});
