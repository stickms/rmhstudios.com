import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { prisma } from '@/lib/prisma.server';
import { invalidateHiddenAuthors } from '@/lib/moderation.server';
import { invalidateFollowingIds } from '@/lib/social/follow-graph.server';
import { z } from 'zod';

/**
 * POST /api/moderation/block — toggle a block on another user.
 * Blocking also removes any follow relationship in both directions.
 * GET — list the ids the current user has blocked.
 */
const blockSchema = z.object({ targetUserId: z.string().min(1).max(64) });

export const Route = createFileRoute('/api/moderation/block')({
  server: {
    handlers: {
      GET: defineHandler({}, async ({ session }) => {
        const blocks = await prisma.userBlock.findMany({
          where: { blockerId: session.user.id },
          select: { blockedId: true, createdAt: true },
          orderBy: { createdAt: 'desc' },
        });
        return Response.json({ blocked: blocks.map((b) => b.blockedId) });
      }),
      POST: defineHandler(
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

          // Create the block and tear down follows both ways in one transaction.
          await prisma.$transaction([
            prisma.userBlock.create({ data: { blockerId, blockedId } }),
            prisma.follow.deleteMany({
              where: {
                OR: [
                  { followerId: blockerId, followingId: blockedId },
                  { followerId: blockedId, followingId: blockerId },
                ],
              },
            }),
          ]);

          // A block mutates both users' hidden-author sets and can drop follows
          // in both directions — invalidate both caches so neither feed is stale.
          invalidateHiddenAuthors(blockerId, blockedId);
          invalidateFollowingIds(blockerId);
          invalidateFollowingIds(blockedId);

          return Response.json({ success: true, blocked: true });
        },
      ),
    },
  },
});
