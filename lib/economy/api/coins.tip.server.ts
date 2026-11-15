import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { prisma } from '@/lib/prisma.server';
import { transferCoins } from '@/lib/economy/ledger.server';
import { tipApi } from '@/lib/economy/tip.contract';
// The amount bounds and the note cap live in a client-safe module so the tip
// dialog validates against the same declaration this route enforces.
import { tipSchema } from '@/lib/economy/tip-schema';
import { userChipSelect } from '@/lib/user-display';
import { createNotification } from '@/lib/notifications.server';
import { grantAchievement } from '@/lib/achievements/engine.server';
import { assertNoRecoveryHold } from '@/lib/recovery/hold.server';

/**
 * POST /api/coins/tip — send coins to another user (a "tip jar").
 * Body: { recipientId, amount, note?, entityType?, entityId? }.
 */
export const route = apiRoute('/api/coins/tip', {
  POST: implement(
    tipApi,
    {
      rateLimit: { limit: 20, windowMs: 60_000, prefix: 'coins-tip' },
      body: tipSchema,
      allowEmptyBody: true,
      invalid: (error) =>
        Response.json({ error: error.issues[0]?.message ?? 'Invalid input' }, { status: 400 }),
    },
    async ({ session, body }) => {
      try {
        const { recipientId, amount, note, entityType, entityId } = body;
        const senderId = session.user.id;
        if (recipientId === senderId) {
          return Response.json({ error: 'You cannot tip yourself' }, { status: 400 });
        }

        // A recovered account is held for 72h before it can move value.
        // Without this the hold is reported and not enforced, and account
        // recovery becomes the cheapest route into the economy.
        const held = await assertNoRecoveryHold(senderId);
        if (held) return held;

        const recipient = await prisma.user.findUnique({
          where: { id: recipientId },
          select: userChipSelect,
        });
        if (!recipient) return Response.json({ error: 'Recipient not found' }, { status: 404 });

        // Debit, credit and ledger row in one atomic transfer. The balance
        // guard lives inside the UPDATE, so concurrent tips can't both pass a
        // stale read and overdraft (which would mint coins into the recipient).
        await transferCoins(senderId, recipientId, amount, {
          type: 'TIP',
          note: note?.trim() || undefined,
          entityType: entityType ?? undefined,
          entityId: entityId ?? undefined,
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

        const profile = await prisma.userProfile.findUnique({
          where: { userId: senderId },
          select: { coins: true },
        });
        return { success: true as const, newBalance: Number(profile?.coins ?? 0) };
      } catch (error) {
        if (error instanceof Error && error.message === 'INSUFFICIENT_COINS') {
          return Response.json({ error: 'Not enough coins' }, { status: 400 });
        }
        throw error;
      }
    },
  ),
});
