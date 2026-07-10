import { createFileRoute } from '@tanstack/react-router';
import { prisma } from '@/lib/prisma.server';
import { withDeveloperApi, apiOptions } from '@/lib/api/with-developer-api.server';
import { levelInfo } from '@/lib/xp/levels';

/** GET /api/v1/me — the authenticated key owner's account summary. */
export const Route = createFileRoute('/api/v1/me')({
  server: {
    handlers: {
      OPTIONS: () => apiOptions(),
      GET: ({ request }) =>
        withDeveloperApi(
          request,
          async ({ userId, tier, json, error }) => {
            const [user, profile, followers, following, posts] = await Promise.all([
              prisma.user.findUnique({ where: { id: userId }, select: { id: true, name: true, handle: true, image: true, createdAt: true } }),
              prisma.userProfile.findUnique({ where: { userId }, select: { coins: true, xp: true } }),
              prisma.follow.count({ where: { followingId: userId } }),
              prisma.follow.count({ where: { followerId: userId } }),
              prisma.rMHark.count({ where: { userId, deletedAt: null } }),
            ]);
            if (!user) return error('not_found', 'User not found', 404);

            const level = levelInfo(profile?.xp ?? 0);
            return json({
              id: user.id,
              name: user.name,
              handle: user.handle,
              image: user.image,
              createdAt: user.createdAt,
              tier,
              stats: {
                coins: profile?.coins ?? 0,
                xp: level.xp,
                level: level.level,
                followers,
                following,
                posts,
              },
            });
          },
          { scope: 'read:profile' }
        ),
    },
  },
});
