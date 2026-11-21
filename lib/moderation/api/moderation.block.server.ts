import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { listBlockedUsersApi, toggleBlockApi } from '@/lib/moderation/moderation.contract';
import { prisma } from '@/lib/prisma.server';
import { invalidateHiddenAuthors } from '@/lib/moderation.server';
import { invalidateFollowingIds } from '@/lib/social/follow-graph.server';
import { invalidateAudience, recordFollowEvent } from '@/lib/social/follow-events.server';
import { z } from 'zod';

/**
 * POST /api/moderation/block — toggle a block on another user.
 * Blocking also removes any follow relationship in both directions.
 * GET — list the ids the current user has blocked.
 */
const blockSchema = z.object({ targetUserId: z.string().min(1).max(64) });

export const route = apiRoute('/api/moderation/block', {
  GET: implement(listBlockedUsersApi, {}, async ({ session }) => {
    const blocks = await prisma.userBlock.findMany({
      where: { blockerId: session.user.id },
      select: { blockedId: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    });
    return Response.json({ blocked: blocks.map((b) => b.blockedId) });
  }),
  POST: implement(
    toggleBlockApi,
    {
      rateLimit: { limit: 30, windowMs: 60_000, prefix: 'moderation-block' },
      body: blockSchema,
      allowEmptyBody: true,
    },
    async ({ session, body }) => {
      const blockerId = session.user.id;
      const blockedId = body.targetUserId;
      if (blockerId === blockedId) {
        return Response.json({ error: 'You cannot block yourself' }, { status: 400 });
      }

      const existing = await prisma.userBlock.findUnique({
        where: { blockerId_blockedId: { blockerId, blockedId } },
      });

      if (existing) {
        await prisma.userBlock.delete({ where: { id: existing.id } });
        // Both users' hidden-author sets change when a block is lifted.
        invalidateHiddenAuthors(blockerId, blockedId);
        return Response.json({ success: true, blocked: false });
      }

      // Admins cannot be blocked (an existing block can still be lifted above).
      const target = await prisma.user.findUnique({
        where: { id: blockedId },
        select: { isAdmin: true },
      });
      if (target?.isAdmin) {
        return Response.json({ error: 'You cannot block an admin' }, { status: 403 });
      }

      // Create the block and tear down follows both ways in one transaction. Each follow the
      // block removes is logged as `blocked` in the same transaction.
      await prisma.$transaction(async (tx) => {
        await tx.userBlock.create({ data: { blockerId, blockedId } });
        const edges = await tx.follow.findMany({
          where: {
            OR: [
              { followerId: blockerId, followingId: blockedId },
              { followerId: blockedId, followingId: blockerId },
            ],
          },
          select: { id: true, followerId: true, followingId: true },
        });
        for (const edge of edges) {
          // Only the transaction that actually removes the edge logs it and moves the counters,
          // so a concurrent unfollow can never produce a second event.
          const removed = await tx.follow.deleteMany({ where: { id: edge.id } });
          if (removed.count === 0) continue;
          await tx.user.updateMany({
            where: { id: edge.followingId, followerCount: { gt: 0 } },
            data: { followerCount: { decrement: 1 } },
          });
          await tx.user.updateMany({
            where: { id: edge.followerId, followingCount: { gt: 0 } },
            data: { followingCount: { decrement: 1 } },
          });
          await recordFollowEvent(tx, {
            followerId: edge.followerId,
            followingId: edge.followingId,
            kind: 'blocked',
          });
        }
      });

      // A block mutates both users' hidden-author sets and can drop follows
      // in both directions — invalidate both caches so neither feed is stale.
      invalidateHiddenAuthors(blockerId, blockedId);
      invalidateFollowingIds(blockerId);
      invalidateFollowingIds(blockedId);
      invalidateAudience(blockerId);
      invalidateAudience(blockedId);

      return Response.json({ success: true, blocked: true });
    },
  ),
});
