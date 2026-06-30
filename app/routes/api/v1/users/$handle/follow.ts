import { createFileRoute } from '@tanstack/react-router';
import { prisma } from '@/lib/prisma.server';
import { withDeveloperApi, apiOptions } from '@/lib/api/with-developer-api.server';
import { followUser, unfollowUser } from '@/lib/social/engagement.server';

/**
 * POST   /api/v1/users/{handle}/follow — follow a user (idempotent).
 * DELETE /api/v1/users/{handle}/follow — unfollow a user (idempotent).
 */
export const Route = createFileRoute('/api/v1/users/$handle/follow')({
  server: {
    handlers: {
      OPTIONS: () => apiOptions(),

      POST: ({ request, params }) =>
        withDeveloperApi(
          request,
          async ({ userId, json, error }) => {
            const target = await prisma.user.findUnique({ where: { handle: params.handle.replace(/^@/, '') }, select: { id: true } });
            if (!target) return error('not_found', 'User not found.', 404);
            const me = await prisma.user.findUnique({ where: { id: userId }, select: { handle: true } });
            const r = await followUser({ followerId: userId, followingId: target.id, followerHandle: me?.handle });
            if (r.selfFollow) return error('invalid_request', 'You cannot follow yourself.', 400);
            return json({ following: r.following });
          },
          { scope: 'write:follows', idempotent: true }
        ),

      DELETE: ({ request, params }) =>
        withDeveloperApi(
          request,
          async ({ userId, json, error }) => {
            const target = await prisma.user.findUnique({ where: { handle: params.handle.replace(/^@/, '') }, select: { id: true } });
            if (!target) return error('not_found', 'User not found.', 404);
            const r = await unfollowUser({ followerId: userId, followingId: target.id });
            return json({ following: r.following });
          },
          { scope: 'write:follows', idempotent: true }
        ),
    },
  },
});
