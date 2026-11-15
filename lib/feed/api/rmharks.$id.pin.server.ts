import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { prisma } from '@/lib/prisma.server';
import { pinPostApi } from '@/lib/feed/rmhark-actions.contract';

/**
 * POST /api/rmharks/$id/pin — toggle pinning your own post to your profile.
 * Only one post can be pinned per user, so pinning unpins any other.
 */
export const route = apiRoute('/api/rmharks/$id/pin', {
  POST: implement(pinPostApi, {}, async ({ params, session }) => {
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
  }),
});
