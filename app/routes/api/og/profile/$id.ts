import { createFileRoute } from '@tanstack/react-router';
import { prisma } from '@/lib/prisma.server';
import { resolveUserDisplay } from '@/lib/user-display';
import { renderProfileOgImage } from '@/lib/og/profile-image.server';

/**
 * GET /api/og/profile/$id — dynamic Open Graph card image (PNG) for a profile.
 * $id may be a handle or a user id (matching the /u/$userid route).
 */
export const Route = createFileRoute('/api/og/profile/$id')({
  server: {
    handlers: {
      GET: async ({ params }) => {
        try {
          const id = params.id.replace(/^@/, '');
          const select = {
            id: true,
            name: true,
            handle: true,
            username: true,
            image: true,
            followerCount: true,
            profile: { select: { displayName: true, customImage: true, bio: true } },
          } as const;

          const user =
            (await prisma.user.findUnique({ where: { handle: id }, select })) ??
            (await prisma.user.findUnique({ where: { id }, select }));

          if (!user) {
            return new Response('Not found', { status: 404 });
          }

          const resolved = resolveUserDisplay(user);
          const postCount = await prisma.rMHark.count({
            where: { userId: user.id, deletedAt: null },
          });

          const png = await renderProfileOgImage({
            id: user.id,
            name: resolved.name || 'RMH Studios',
            handle: user.handle ?? user.username ?? null,
            image: resolved.image ?? null,
            bio: user.profile?.bio ?? null,
            followerCount: user.followerCount ?? 0,
            postCount,
          });

          return new Response(new Uint8Array(png), {
            headers: {
              'Content-Type': 'image/png',
              'Cache-Control': 'public, max-age=600, s-maxage=3600, stale-while-revalidate=86400',
            },
          });
        } catch (error) {
          console.error('Profile OG image error:', error);
          return new Response('Failed to render image', { status: 500 });
        }
      },
    },
  },
});
