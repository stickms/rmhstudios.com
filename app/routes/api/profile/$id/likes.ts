import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { prisma } from '@/lib/prisma.server';
import { viewerVisiblePostWhere } from '@/lib/feed/audience.server';
import { mapRmharksWithBoundedReactions, rmharkIncludeLite } from '@/lib/feed/map-feed-item.server';
import { isExpired } from '@/lib/posts-plus/constants';

export const Route = createFileRoute('/api/profile/$id/likes')({
  server: {
    handlers: {
      GET: defineHandler({ auth: 'optional' }, async ({ request, params, userId: viewerId }) => {
        const { id: idOrHandle } = params;
        const resolvedUser = await prisma.user.findUnique({
          where: { handle: idOrHandle },
          select: { id: true },
        });
        const profileUserId = resolvedUser?.id ?? idOrHandle;
        const { searchParams } = new URL(request.url);
        const cursor = searchParams.get('cursor');
        const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 50);

        // Fetch liked posts via RMHarkLike join. The post behind each like gets the
        // full visibility check (not deleted, audience, blocks, community) IN the
        // query, so a page is never short of rows that exist: this tab used to return
        // every liked post regardless, which exposed PRIVATE / FOLLOWERS / CIRCLE
        // posts and the text of deleted ones to anyone who could open the Likes tab.
        // perf: started before the showLikes check so the two round trips overlap.
        const likesPromise = prisma.rMHarkLike.findMany({
          where: {
            userId: profileUserId,
            rmhark: await viewerVisiblePostWhere(viewerId),
            ...(cursor ? { createdAt: { lt: new Date(cursor) } } : {}),
          },
          orderBy: { createdAt: 'desc' },
          take: limit,
          // The same lite include every other feed surface uses: counts come from
          // the denormalized columns (not four COUNT subqueries per post and per
          // quoted original) and reactions load as two bounded aggregates for the
          // whole page instead of one row per reaction per post.
          include: { rmhark: { include: rmharkIncludeLite(viewerId) } },
        });

        // Check visibility: allow if own profile or showLikes is true. The page
        // above is discarded if the profile hides its likes.
        const isOwnProfile = viewerId === profileUserId;
        if (!isOwnProfile) {
          const profile = await prisma.userProfile.findUnique({
            where: { userId: profileUserId },
            select: { showLikes: true },
          });
          if (!profile?.showLikes) {
            likesPromise.catch(() => {});
            return Response.json({ items: [], nextCursor: null, hasMore: false });
          }
        }

        const likes = await likesPromise;

        // posts-plus X8: posts past their TTL are hidden at read time.
        const live = likes.filter((l) => !isExpired(l.rmhark.expiresAt));
        const mapped = await mapRmharksWithBoundedReactions(
          live.map((l) => l.rmhark),
          viewerId,
        );
        // The tab is ordered (and paged) by when the profile owner LIKED the post.
        const items = mapped.map((item, i) => ({
          ...item,
          createdAt: live[i].createdAt.toISOString(),
        }));

        const nextCursor =
          likes.length === limit ? likes[likes.length - 1].createdAt.toISOString() : null;

        return Response.json({
          items,
          nextCursor,
          hasMore: likes.length === limit,
        });
      }),
    },
  },
});
