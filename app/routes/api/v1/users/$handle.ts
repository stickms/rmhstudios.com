import { createFileRoute } from '@tanstack/react-router';
import { prisma } from '@/lib/prisma.server';
import { withDeveloperApi, apiOptions } from '@/lib/api/with-developer-api.server';
import { serializeAuthor, apiAuthorSelect } from '@/lib/api/serializers.server';
import { levelInfo } from '@/lib/xp/levels';

/** GET /api/v1/users/{handle} — a public user profile by handle. */
export const Route = createFileRoute('/api/v1/users/$handle')({
  server: {
    handlers: {
      OPTIONS: () => apiOptions(),

      GET: ({ request, params }) =>
        withDeveloperApi(
          request,
          async ({ json, error }) => {
            const handle = params.handle.replace(/^@/, '');
            const user = await prisma.user.findUnique({
              where: { handle },
              select: {
                ...apiAuthorSelect,
                createdAt: true,
                profile: { select: { displayName: true, customImage: true, bio: true, location: true, website: true, xp: true } },
              },
            });
            if (!user) return error('not_found', 'User not found.', 404);

            const [followers, following, posts] = await Promise.all([
              prisma.follow.count({ where: { followingId: user.id } }),
              prisma.follow.count({ where: { followerId: user.id } }),
              prisma.rMHark.count({ where: { userId: user.id, deletedAt: null, audience: 'PUBLIC' } }),
            ]);

            const author = serializeAuthor(user);
            return json({
              ...author,
              bio: user.profile?.bio ?? null,
              location: user.profile?.location ?? null,
              website: user.profile?.website ?? null,
              createdAt: user.createdAt,
              stats: { followers, following, posts, level: levelInfo(user.profile?.xp ?? 0).level },
            });
          },
          { scope: 'read:users' }
        ),
    },
  },
});
