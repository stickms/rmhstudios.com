import { createFileRoute } from '@tanstack/react-router';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma.server';
import { rmharkInclude, mapRmharkToFeedItem } from '@/lib/feed/map-feed-item.server';
import { getHiddenAuthorIds } from '@/lib/moderation.server';

/** GET /api/communities/$slug/feed — posts in a community (cursor paginated). */
export const Route = createFileRoute('/api/communities/$slug/feed')({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        try {
          const session = await auth.api.getSession({ headers: request.headers }).catch(() => null);
          const viewerId = session?.user?.id ?? null;

          const community = await prisma.community.findUnique({
            where: { slug: params.slug },
            select: { id: true },
          });
          if (!community) return Response.json({ error: 'Not found' }, { status: 404 });

          const url = new URL(request.url);
          const cursor = url.searchParams.get('cursor');
          const limit = Math.min(parseInt(url.searchParams.get('limit') || '20'), 50);
          const hidden = await getHiddenAuthorIds(viewerId);

          const rows = await prisma.rMHark.findMany({
            where: {
              communityId: community.id,
              deletedAt: null,
              ...(hidden.length ? { userId: { notIn: hidden } } : {}),
            },
            orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
            take: limit + 1,
            ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
            include: rmharkInclude(viewerId),
          });

          const hasMore = rows.length > limit;
          const page = hasMore ? rows.slice(0, limit) : rows;
          return Response.json({
            items: page.map((r) => mapRmharkToFeedItem(r, viewerId)),
            nextCursor: hasMore ? page[page.length - 1]?.id ?? null : null,
            hasMore,
          });
        } catch (error) {
          console.error('Community feed error:', error);
          return Response.json({ error: 'Internal Server Error' }, { status: 500 });
        }
      },
    },
  },
});
