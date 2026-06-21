import { createFileRoute } from '@tanstack/react-router';
import { prisma } from '@/lib/prisma.server';
import { userDisplaySelect, resolveUser } from '@/lib/user-display';

/** GET /api/tips/leaderboard?range=week|all — top tip recipients. */
export const Route = createFileRoute('/api/tips/leaderboard')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const range = new URL(request.url).searchParams.get('range') === 'all' ? 'all' : 'week';
          const since = range === 'week' ? new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) : undefined;

          const grouped = await prisma.coinTransaction.groupBy({
            by: ['recipientId'],
            where: { type: 'TIP', amount: { gt: 0 }, ...(since ? { createdAt: { gte: since } } : {}) },
            _sum: { amount: true },
            orderBy: { _sum: { amount: 'desc' } },
            take: 20,
          });

          const ids = grouped.map((g) => g.recipientId);
          const users = ids.length
            ? await prisma.user.findMany({ where: { id: { in: ids } }, select: userDisplaySelect })
            : [];
          const byId = new Map(users.map((u) => [u.id, u]));

          const leaders = grouped
            .map((g) => {
              const u = byId.get(g.recipientId);
              if (!u) return null;
              return { user: resolveUser(u), total: g._sum.amount ?? 0 };
            })
            .filter(Boolean);

          return Response.json(
            { range, leaders },
            { headers: { 'Cache-Control': 'public, max-age=120' } }
          );
        } catch (error) {
          console.error('Tip leaderboard error:', error);
          return Response.json({ range: 'week', leaders: [] });
        }
      },
    },
  },
});
