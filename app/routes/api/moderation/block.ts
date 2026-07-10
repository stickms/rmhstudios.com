import { createFileRoute } from '@tanstack/react-router';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma.server';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
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
      GET: async ({ request }) => {
        const session = await auth.api.getSession({ headers: request.headers });
        if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });
        const blocks = await prisma.userBlock.findMany({
          where: { blockerId: session.user.id },
          select: { blockedId: true, createdAt: true },
          orderBy: { createdAt: 'desc' },
        });
        return Response.json({ blocked: blocks.map((b) => b.blockedId) });
      },
      POST: async ({ request }) => {
        try {
          const session = await auth.api.getSession({ headers: request.headers });
          if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });

          const ip = getClientIp(request);
          const { allowed } = rateLimit(ip, { limit: 30, windowMs: 60_000, prefix: 'moderation-block' });
          if (!allowed) return Response.json({ error: 'Too many requests' }, { status: 429 });

          const body = await request.json().catch(() => ({}));
          const parsed = blockSchema.safeParse(body);
          if (!parsed.success) return Response.json({ error: 'Invalid input' }, { status: 400 });

          const blockerId = session.user.id;
          const blockedId = parsed.data.targetUserId;
          if (blockerId === blockedId) {
            return Response.json({ error: 'You cannot block yourself' }, { status: 400 });
          }

          const existing = await prisma.userBlock.findUnique({
            where: { blockerId_blockedId: { blockerId, blockedId } },
          });

          if (existing) {
            await prisma.userBlock.delete({ where: { id: existing.id } });
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

          return Response.json({ success: true, blocked: true });
        } catch (error) {
          console.error('Toggle block error:', error);
          return Response.json({ error: 'Internal Server Error' }, { status: 500 });
        }
      },
    },
  },
});
