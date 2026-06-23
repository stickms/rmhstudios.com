import { createFileRoute } from '@tanstack/react-router';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma.server';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { z } from 'zod';
import { createNotification } from '@/lib/notifications.server';
import { grantAchievement } from '@/lib/achievements/engine.server';

/**
 * POST /api/coins/tip — send coins to another user (a "tip jar").
 * Body: { recipientId, amount, note?, entityType?, entityId? }.
 */
const schema = z.object({
  recipientId: z.string().min(1).max(64),
  amount: z.number().int().min(1).max(100_000),
  note: z.string().max(280).optional(),
  entityType: z.enum(['rmhark', 'profile']).optional(),
  entityId: z.string().max(64).optional(),
});

export const Route = createFileRoute('/api/coins/tip')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const session = await auth.api.getSession({ headers: request.headers });
          if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });

          const ip = getClientIp(request);
          const { allowed } = rateLimit(ip, { limit: 20, windowMs: 60_000, prefix: 'coins-tip' });
          if (!allowed) return Response.json({ error: 'Too many requests' }, { status: 429 });

          const body = await request.json().catch(() => ({}));
          const parsed = schema.safeParse(body);
          if (!parsed.success) {
            return Response.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 });
          }
          const { recipientId, amount, note, entityType, entityId } = parsed.data;
          const senderId = session.user.id;
          if (recipientId === senderId) {
            return Response.json({ error: 'You cannot tip yourself' }, { status: 400 });
          }

          const recipient = await prisma.user.findUnique({ where: { id: recipientId }, select: { id: true, handle: true } });
          if (!recipient) return Response.json({ error: 'Recipient not found' }, { status: 404 });

          await prisma.$transaction(async (tx) => {
            const sender = await tx.userProfile.upsert({
              where: { userId: senderId },
              create: { userId: senderId, coins: 10 },
              update: {},
              select: { coins: true },
            });
            if (sender.coins < amount) throw new Error('INSUFFICIENT_COINS');

            await tx.userProfile.update({ where: { userId: senderId }, data: { coins: { decrement: amount } } });
            await tx.userProfile.upsert({
              where: { userId: recipientId },
              create: { userId: recipientId, coins: 10 + amount },
              update: { coins: { increment: amount } },
            });
            await tx.coinTransaction.create({
              data: {
                senderId,
                recipientId,
                amount,
                type: 'TIP',
                note: note?.trim() || null,
                entityType: entityType ?? null,
                entityId: entityId ?? null,
              },
            });
          });

          // Notify the recipient + achievements (best-effort).
          const senderName = session.user.name ?? 'Someone';
          await createNotification({
            userId: recipientId,
            actorId: senderId,
            type: 'SYSTEM',
            entityType: 'tip',
            entityId,
            preview: `${senderName} tipped you 🪙 ${amount}${note ? ` — “${note.trim()}”` : ''}`,
            link: recipient.handle ? `/u/${recipient.handle}` : undefined,
          });
          await grantAchievement(senderId, 'economy.first_tip_sent');
          await grantAchievement(recipientId, 'economy.first_tip_received');

          const profile = await prisma.userProfile.findUnique({ where: { userId: senderId }, select: { coins: true } });
          return Response.json({ success: true, newBalance: profile?.coins ?? 0 });
        } catch (error) {
          if (error instanceof Error && error.message === 'INSUFFICIENT_COINS') {
            return Response.json({ error: 'Not enough coins' }, { status: 400 });
          }
          console.error('Tip error:', error);
          return Response.json({ error: 'Internal Server Error' }, { status: 500 });
        }
      },
    },
  },
});
