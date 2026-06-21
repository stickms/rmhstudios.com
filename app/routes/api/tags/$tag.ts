import { createFileRoute } from '@tanstack/react-router';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma.server';
import { rmharkInclude, mapRmharkToFeedItem } from '@/lib/feed/map-feed-item.server';
import { getHiddenAuthorIds } from '@/lib/moderation.server';

/** GET /api/tags/$tag — posts containing #tag, newest first (cursor paginated). */
export const Route = createFileRoute('/api/tags/$tag')({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        try {
          const tag = params.tag.replace(/[^\w]/g, '').slice(0, 64);
          if (!tag) return Response.json({ items: [], nextCursor: null, hasMore: false });

          const session = await auth.api.getSession({ headers: request.headers }).catch(() => null);
          const viewerId = session?.user?.id ?? null;

          const url = new URL(request.url);
          const cursor = url.searchParams.get('cursor');
          const limit = Math.min(parseInt(url.searchParams.get('limit') || '20'), 50);
          const hidden = await getHiddenAuthorIds(viewerId);

          const rows = await prisma.rMHark.findMany({
            where: {
              deletedAt: null,
              content: { contains: `#${tag}`, mode: 'insensitive' },
              ...(hidden.length ? { userId: { notIn: hidden } } : {}),
            },
            orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
            take: limit + 1,
            ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
            include: rmharkInclude(viewerId),
          });

          const hasMore = rows.length > limit;
          const page = hasMore ? rows.slice(0, limit) : rows;
          // Guard against substring matches (#tag matching #tagged) — require a word boundary.
          const re = new RegExp(`#${tag}(?![\\w])`, 'i');
          const items = page
            .filter((r) => re.test(r.content))
            .map((r) => mapRmharkToFeedItem(r, viewerId));

          return Response.json({
            tag,
            items,
            nextCursor: hasMore ? page[page.length - 1]?.id ?? null : null,
            hasMore,
          });
        } catch (error) {
          console.error('Tag feed error:', error);
          return Response.json({ error: 'Internal Server Error' }, { status: 500 });
        }
      },
    },
  },
});
