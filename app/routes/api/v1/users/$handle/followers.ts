import { createFileRoute } from '@tanstack/react-router';
import { prisma } from '@/lib/prisma.server';
import { encodeFollowCursor, followCursorWhere, parseFollowCursor, FOLLOW_ORDER_BY } from '@/lib/api/follow-cursor';
import { withDeveloperApi, apiOptions } from '@/lib/api/with-developer-api.server';
import { canSeeFollowLists, filterBlocked } from '@/lib/social/follow-list-privacy.server';
import { apiAuthorSelect, serializeAuthor, parsePage } from '@/lib/api/serializers.server';

/** GET /api/v1/users/{handle}/followers — users who follow this user. */
export const Route = createFileRoute('/api/v1/users/$handle/followers')({
  server: {
    handlers: {
      OPTIONS: () => apiOptions(),

      GET: ({ request, params }) =>
        withDeveloperApi(
          request,
          async ({ json, error, userId: viewerId }) => {
            const handle = params.handle.replace(/^@/, '');
            const user = await prisma.user.findUnique({ where: { handle }, select: { id: true } });
            if (!user) return error('not_found', 'User not found.', 404);
            if (!(await canSeeFollowLists(viewerId, user.id))) {
              return error('list_private', 'This member keeps this list private.', 403);
            }

            const { limit, cursor } = parsePage(new URL(request.url));
            const follows = await prisma.follow.findMany({
              where: { followingId: user.id, ...followCursorWhere(parseFollowCursor(cursor)) },
              orderBy: FOLLOW_ORDER_BY,
              take: limit,
              select: { id: true, createdAt: true, follower: { select: apiAuthorSelect } },
            });
            const nextCursor = follows.length === limit ? encodeFollowCursor(follows[follows.length - 1]) : null;
            // Cursor from the raw page: dropping a blocked account must not end paging early.
            const visible = new Set(await filterBlocked(viewerId, follows.map((f) => f.follower.id)));
            return json({
              data: follows.filter((f) => visible.has(f.follower.id)).map((f) => serializeAuthor(f.follower)),
              nextCursor,
            });
          },
          { scope: 'read:users' }
        ),
    },
  },
});
