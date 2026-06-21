import { createFileRoute } from '@tanstack/react-router';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma.server';

/** GET /api/admin/analytics — platform stats for the admin dashboard. */
export const Route = createFileRoute('/api/admin/analytics')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const session = await auth.api.getSession({ headers: request.headers });
          if (!session || !(session.user as { isAdmin?: boolean }).isAdmin) {
            return Response.json({ error: 'Forbidden' }, { status: 403 });
          }

          const now = Date.now();
          const d7 = new Date(now - 7 * 24 * 60 * 60 * 1000);
          const d30 = new Date(now - 30 * 24 * 60 * 60 * 1000);

          const [
            totalUsers, newUsers7, newUsers30,
            totalPosts, posts7,
            totalComments, totalBuilds,
            activeUsers7, pendingReports, coinsAgg,
            postSeries,
          ] = await Promise.all([
            prisma.user.count(),
            prisma.user.count({ where: { createdAt: { gte: d7 } } }),
            prisma.user.count({ where: { createdAt: { gte: d30 } } }),
            prisma.rMHark.count({ where: { deletedAt: null } }),
            prisma.rMHark.count({ where: { deletedAt: null, createdAt: { gte: d7 } } }),
            prisma.rMHarkComment.count({ where: { deletedAt: null } }),
            prisma.userBuild.count(),
            prisma.rMHark.findMany({
              where: { createdAt: { gte: d7 } },
              select: { userId: true },
              distinct: ['userId'],
            }),
            prisma.contentReport.count({ where: { status: { in: ['PENDING', 'REVIEWING'] } } }),
            prisma.userProfile.aggregate({ _sum: { coins: true } }),
            // Posts per day for the last 14 days.
            prisma.$queryRaw<{ day: Date; count: bigint }[]>`
              SELECT date_trunc('day', "createdAt") AS day, count(*) AS count
              FROM "rmheet"
              WHERE "createdAt" >= ${new Date(now - 14 * 24 * 60 * 60 * 1000)} AND "deletedAt" IS NULL
              GROUP BY 1 ORDER BY 1 ASC
            `,
          ]);

          return Response.json({
            users: { total: totalUsers, new7: newUsers7, new30: newUsers30, active7: activeUsers7.length },
            content: { posts: totalPosts, posts7, comments: totalComments, builds: totalBuilds },
            moderation: { pendingReports },
            economy: { coinsInCirculation: coinsAgg._sum.coins ?? 0 },
            postsPerDay: postSeries.map((r) => ({
              day: r.day.toISOString().slice(0, 10),
              count: Number(r.count),
            })),
          });
        } catch (error) {
          console.error('Admin analytics error:', error);
          return Response.json({ error: 'Internal Server Error' }, { status: 500 });
        }
      },
    },
  },
});
