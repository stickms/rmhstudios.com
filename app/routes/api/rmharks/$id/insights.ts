import { createFileRoute } from '@tanstack/react-router';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma.server';

/**
 * GET /api/rmharks/$id/insights — author-only analytics for one post.
 * Returns engagement totals, engagement rate, a 7-day like trend, and (for
 * paid posts) unlock count + coins earned.
 */
export const Route = createFileRoute('/api/rmharks/$id/insights')({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        try {
          const session = await auth.api.getSession({ headers: request.headers });
          if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });

          const { id } = params;
          const post = await prisma.rMHark.findUnique({
            where: { id },
            select: {
              userId: true,
              createdAt: true,
              viewCount: true,
              likeCount: true,
              commentCount: true,
              repostCount: true,
              unlockPrice: true,
            },
          });
          if (!post) return Response.json({ error: 'Not found' }, { status: 404 });
          if (post.userId !== session.user.id) {
            return Response.json({ error: 'Forbidden' }, { status: 403 });
          }

          const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
          const [bookmarks, unlockAgg, recentLikes] = await Promise.all([
            prisma.rMHarkBookmark.count({ where: { rmheetId: id } }),
            post.unlockPrice
              ? prisma.postUnlock.aggregate({
                  where: { rmheetId: id },
                  _count: { _all: true },
                  _sum: { pricePaid: true },
                })
              : Promise.resolve(null),
            prisma.rMHarkLike.findMany({
              where: { rmheetId: id, createdAt: { gte: sevenDaysAgo } },
              select: { createdAt: true },
            }),
          ]);

          // Bucket recent likes into the last 7 calendar days (UTC).
          const days: { date: string; count: number }[] = [];
          const byDay = new Map<string, number>();
          for (const l of recentLikes) {
            const key = l.createdAt.toISOString().slice(0, 10);
            byDay.set(key, (byDay.get(key) ?? 0) + 1);
          }
          for (let i = 6; i >= 0; i--) {
            const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
            const key = d.toISOString().slice(0, 10);
            days.push({ date: key, count: byDay.get(key) ?? 0 });
          }

          const engagements = post.likeCount + post.commentCount + post.repostCount;
          const engagementRate = post.viewCount > 0 ? engagements / post.viewCount : 0;

          return Response.json({
            createdAt: post.createdAt,
            views: post.viewCount,
            likes: post.likeCount,
            comments: post.commentCount,
            reposts: post.repostCount,
            bookmarks,
            engagementRate,
            isPaid: !!post.unlockPrice,
            unlockPrice: post.unlockPrice ?? null,
            unlocks: unlockAgg?._count._all ?? 0,
            coinsEarned: unlockAgg?._sum.pricePaid ?? 0,
            likeTrend: days,
          });
        } catch (error) {
          console.error('Post insights error:', error);
          return Response.json({ error: 'Internal Server Error' }, { status: 500 });
        }
      },
    },
  },
});
