import { createFileRoute } from '@tanstack/react-router';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma.server';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { createNotification } from '@/lib/notifications.server';

/**
 * POST /api/rmharks/$id/unlock — pay the post's unlock price (coins → author)
 * to permanently reveal its content. Idempotent: returns content if already
 * unlocked or if the post is free.
 */
export const Route = createFileRoute('/api/rmharks/$id/unlock')({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        try {
          const session = await auth.api.getSession({ headers: request.headers });
          if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });

          const ip = getClientIp(request);
          const { allowed } = rateLimit(ip, { limit: 20, windowMs: 60_000, prefix: 'post-unlock' });
          if (!allowed) return Response.json({ error: 'Too many requests' }, { status: 429 });

          const { id } = params;
          const userId = session.user.id;

          const post = await prisma.rMHark.findUnique({
            where: { id },
            select: { id: true, userId: true, unlockPrice: true, content: true, deletedAt: true },
          });
          if (!post || post.deletedAt) return Response.json({ error: 'Post not found' }, { status: 404 });

          // Author or free post — nothing to pay.
          if (post.userId === userId || !post.unlockPrice || post.unlockPrice <= 0) {
            return Response.json({ success: true, content: post.content, alreadyUnlocked: true });
          }

          const already = await prisma.postUnlock.findUnique({
            where: { userId_rmheetId: { userId, rmheetId: id } },
            select: { id: true },
          });
          if (already) {
            return Response.json({ success: true, content: post.content, alreadyUnlocked: true });
          }

          const price = post.unlockPrice;
          await prisma.$transaction(async (tx) => {
            const buyer = await tx.userProfile.upsert({
              where: { userId },
              create: { userId, coins: 10 },
              update: {},
              select: { coins: true },
            });
            if (buyer.coins < price) throw new Error('INSUFFICIENT_COINS');

            await tx.userProfile.update({ where: { userId }, data: { coins: { decrement: price } } });
            await tx.userProfile.upsert({
              where: { userId: post.userId },
              create: { userId: post.userId, coins: 10 + price },
              update: { coins: { increment: price } },
            });
            await tx.postUnlock.create({ data: { userId, rmheetId: id, pricePaid: price } });
            await tx.coinTransaction.create({
              data: { senderId: userId, recipientId: post.userId, amount: price, type: 'PURCHASE', entityType: 'rmhark', entityId: id, note: 'Post unlock' },
            });
          });

          await createNotification({
            userId: post.userId,
            actorId: userId,
            type: 'SYSTEM',
            entityType: 'rmhark',
            entityId: id,
            preview: `${session.user.name ?? 'Someone'} unlocked your post for 🪙 ${price}`,
          });

          return Response.json({ success: true, content: post.content });
        } catch (error) {
          if (error instanceof Error && error.message === 'INSUFFICIENT_COINS') {
            return Response.json({ error: 'Not enough coins' }, { status: 400 });
          }
          console.error('Post unlock error:', error);
          return Response.json({ error: 'Internal Server Error' }, { status: 500 });
        }
      },
    },
  },
});
