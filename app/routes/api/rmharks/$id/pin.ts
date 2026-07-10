import { createFileRoute } from '@tanstack/react-router';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma.server';

/**
 * POST /api/rmharks/$id/pin — toggle pinning your own post to your profile.
 * Only one post can be pinned per user, so pinning unpins any other.
 */
export const Route = createFileRoute('/api/rmharks/$id/pin')({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        try {
          const session = await auth.api.getSession({ headers: request.headers });
          if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });

          const { id } = params;
          const post = await prisma.rMHark.findUnique({
            where: { id },
            select: { userId: true, pinnedAt: true },
          });
          if (!post) return Response.json({ error: 'Post not found' }, { status: 404 });
          if (post.userId !== session.user.id) {
            return Response.json({ error: 'You can only pin your own posts' }, { status: 403 });
          }

          if (post.pinnedAt) {
            await prisma.rMHark.update({ where: { id }, data: { pinnedAt: null } });
            return Response.json({ success: true, pinned: false });
          }

          // Pin this one and clear any previously-pinned post in one transaction.
          await prisma.$transaction([
            prisma.rMHark.updateMany({
              where: { userId: session.user.id, pinnedAt: { not: null } },
              data: { pinnedAt: null },
            }),
            prisma.rMHark.update({ where: { id }, data: { pinnedAt: new Date() } }),
          ]);
          return Response.json({ success: true, pinned: true });
        } catch (error) {
          console.error('Toggle pin error:', error);
          return Response.json({ error: 'Internal Server Error' }, { status: 500 });
        }
      },
    },
  },
});
