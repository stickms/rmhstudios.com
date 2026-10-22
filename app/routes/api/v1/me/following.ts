import { createFileRoute } from '@tanstack/react-router';
import { prisma } from '@/lib/prisma.server';
import { encodeFollowCursor, followCursorWhere, parseFollowCursor, FOLLOW_ORDER_BY } from '@/lib/api/follow-cursor';
import { withDeveloperApi, apiOptions } from '@/lib/api/with-developer-api.server';
import { apiAuthorSelect, serializeAuthor, parsePage } from '@/lib/api/serializers.server';

/** GET /api/v1/me/following — users the authenticated account follows. */
export const Route = createFileRoute('/api/v1/me/following')({
  server: {
    handlers: {
      OPTIONS: () => apiOptions(),

      GET: ({ request }) =>
        withDeveloperApi(
          request,
          async ({ userId, json }) => {
            const { limit, cursor } = parsePage(new URL(request.url));
            const follows = await prisma.follow.findMany({
              where: { followerId: userId, ...followCursorWhere(parseFollowCursor(cursor)) },
              orderBy: FOLLOW_ORDER_BY,
              take: limit,
              select: { id: true, createdAt: true, following: { select: apiAuthorSelect } },
            });
            const nextCursor = follows.length === limit ? encodeFollowCursor(follows[follows.length - 1]) : null;
            return json({ data: follows.map((f) => serializeAuthor(f.following)), nextCursor });
          },
          { scope: 'read:profile' }
        ),
    },
  },
});
