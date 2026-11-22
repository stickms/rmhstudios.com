import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { tipsLeaderboardApi } from '@/lib/discovery/explore.contract';
import { prisma } from '@/lib/prisma.server';
import { leaderboardHiddenUserIds } from '@/lib/game/leaderboard-privacy.server';
import { userDisplaySelect, resolveUser } from '@/lib/user-display';

/** GET /api/tips/leaderboard?range=week|all — top tip recipients. */
export const route = apiRoute('/api/tips/leaderboard', {
  GET: implement(tipsLeaderboardApi, { auth: 'none' }, async ({ request }) => {
    try {
      const range = new URL(request.url).searchParams.get('range') === 'all' ? 'all' : 'week';
      const since = range === 'week' ? new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) : undefined;

      const hidden = await leaderboardHiddenUserIds();
      const grouped = await prisma.coinTransaction.groupBy({
        by: ['recipientId'],
        where: {
          type: 'TIP',
          amount: { gt: 0 },
          // A TIP row with no recipient is a fee SINK (coins destroyed),
          // not a tip anyone received — excluding it keeps the leaderboard
          // measuring what its name says.
          // Hidden members are left out before the cut, so the next recipient moves up.
          recipientId: { not: null, ...(hidden.size > 0 ? { notIn: [...hidden] } : {}) },
          ...(since ? { createdAt: { gte: since } } : {}),
        },
        _sum: { amount: true },
        orderBy: { _sum: { amount: 'desc' } },
        take: 20,
      });

      const ids = grouped.map((g) => g.recipientId).filter((id): id is string => id !== null);
      const users = ids.length
        ? await prisma.user.findMany({ where: { id: { in: ids } }, select: userDisplaySelect })
        : [];
      const byId = new Map(users.map((u) => [u.id, u]));

      const leaders = grouped
        .map((g) => {
          const u = g.recipientId ? byId.get(g.recipientId) : undefined;
          if (!u) return null;
          return { user: resolveUser(u), total: g._sum.amount ?? 0 };
        })
        .filter((l): l is NonNullable<typeof l> => l !== null);

      return Response.json(
        { range, leaders },
        { headers: { 'Cache-Control': 'public, max-age=120' } },
      );
    } catch (error) {
      console.error('Tip leaderboard error:', error);
      return Response.json({ range: 'week', leaders: [] });
    }
  }),
});
