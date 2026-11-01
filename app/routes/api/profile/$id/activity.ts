import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { prisma } from '@/lib/prisma.server';
import { audienceWhereExact, communityVisibleWhere } from '@/lib/feed/audience.server';
import { getBlockedAuthorIds } from '@/lib/moderation.server';
import { isExpired } from '@/lib/posts-plus/constants';
import { HEATMAP_WEEKS, bucketByDay, windowStart } from '@/lib/profile/activity';

/**
 * GET /api/profile/:id/activity — posts per UTC day over the last 26 weeks, for
 * the profile heatmap. Only counts posts the viewer could already open from the
 * profile's post list (same audience, community and block rules), so the grid
 * never reveals activity the list would hide.
 */
export const Route = createFileRoute('/api/profile/$id/activity')({
  server: {
    handlers: {
      GET: defineHandler(
        { auth: 'optional', rateLimit: 'read', label: 'profile-activity' },
        async ({ params, userId: viewerId }) => {
          const { id: idOrHandle } = params;
          const resolved = await prisma.user.findUnique({
            where: { handle: idOrHandle },
            select: { id: true },
          });
          const userId = resolved?.id ?? idOrHandle;

          const blocked = await getBlockedAuthorIds(viewerId);
          const empty = { days: {}, total: 0, weeks: HEATMAP_WEEKS };
          if (viewerId && viewerId !== userId && blocked.includes(userId)) {
            return Response.json(empty);
          }

          const now = new Date();
          const rows = await prisma.rMHark.findMany({
            where: {
              userId,
              deletedAt: null,
              createdAt: { gte: windowStart(now) },
              AND: [audienceWhereExact(viewerId), communityVisibleWhere(viewerId)],
            },
            select: { createdAt: true, expiresAt: true },
            orderBy: { createdAt: 'desc' },
            take: 5000,
          });

          const days = bucketByDay(
            rows.filter((r) => !isExpired(r.expiresAt)).map((r) => r.createdAt),
            now,
          );
          const total = Object.values(days).reduce((a, b) => a + b, 0);
          return Response.json(
            { days, total, weeks: HEATMAP_WEEKS },
            { headers: { 'Cache-Control': 'private, max-age=60' } },
          );
        },
      ),
    },
  },
});
