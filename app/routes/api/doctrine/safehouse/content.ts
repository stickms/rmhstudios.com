import { createFileRoute } from '@tanstack/react-router';
import { prisma } from '@/lib/prisma.server';
import { auth } from '@/lib/auth';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { getUserTier, checkTierAccess } from '@/lib/doctrine/tiers';
import { aggregateReactions, calculateDivisiveness } from '@/lib/doctrine/divisiveness';
import { apiCache } from '@/lib/cache';
import type { TierId } from '@/lib/doctrine/types';

export const Route = createFileRoute('/api/doctrine/safehouse/content')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const ip = getClientIp(request);
        const { allowed } = rateLimit(ip, { limit: 20, windowMs: 60_000, prefix: 'doctrine-safehouse' });
        if (!allowed) return Response.json({ error: 'Too many requests' }, { status: 429 });

        try {
          const session = await auth.api.getSession({ headers: request.headers });
          if (!session?.user?.id) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
          }

          const userTier = await getUserTier(session.user.id);
          const url = new URL(request.url);
          const cursor = url.searchParams.get('cursor') ?? undefined;
          const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '20'), 50);

          // Get content the user has access to
          const tierFilter: TierId[] = [];
          if (checkTierAccess(userTier, 'OPERATOR')) tierFilter.push('PUBLIC', 'INSIDER', 'OPERATOR');
          else if (checkTierAccess(userTier, 'INSIDER')) tierFilter.push('PUBLIC', 'INSIDER');
          else tierFilter.push('PUBLIC');

          const content = await prisma.doctrineSafehouseContent.findMany({
            where: {
              minTier: { in: tierFilter },
              publishedAt: { not: null },
            },
            orderBy: { publishedAt: 'desc' },
            take: limit + 1,
            ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
            include: { reactions: true },
          });

          const hasMore = content.length > limit;
          const items = content.slice(0, limit).map(item => {
            const reactionCounts = aggregateReactions(item.reactions);
            return {
              id: item.id,
              type: item.type,
              title: item.title,
              body: item.body,
              minTier: item.minTier,
              mediaUrls: item.mediaUrls,
              publishedAt: item.publishedAt,
              reactions: reactionCounts,
              divisiveness: calculateDivisiveness(reactionCounts),
            };
          });

          // Log access
          if (items.length > 0) {
            await prisma.doctrineAccessLog.createMany({
              data: items.map(item => ({
                userId: session.user.id,
                contentId: item.id,
              })),
              skipDuplicates: true,
            });
          }

          return Response.json({
            items,
            nextCursor: hasMore ? items[items.length - 1]?.id : null,
          });
        } catch (e) {
          console.error('Doctrine safehouse content failed:', e);
          return Response.json({ error: 'Internal Server Error' }, { status: 500 });
        }
      },
    },
  },
});
