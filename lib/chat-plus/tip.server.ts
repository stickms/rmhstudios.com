/**
 * `/tip <amount>` (M4). Server-only.
 *
 * Moves coins with `transferCoins` — the ledger's conserved-supply transfer, the
 * same call `app/routes/api/coins/tip.ts` makes — so nothing is minted. It is a
 * second entry point to the existing tip flow, not a second economy: same
 * ledger type (`TIP`), same recovery-hold gate, same notification and
 * achievements. The in-chat line is posted by the server AFTER the transfer
 * succeeds, so it cannot be faked.
 */

import { prisma } from '@/lib/prisma.server';
import { transferCoins, InsufficientFundsError } from '@/lib/economy/ledger.server';
import { createNotification } from '@/lib/notifications.server';
import { grantAchievement } from '@/lib/achievements/engine.server';
import { getRecoveryHold } from '@/lib/recovery/hold.server';
import type { ChatAccess } from '@/lib/chat-plus/access.server';
import { postSystemLine, type PostedMessage } from '@/lib/chat-plus/post.server';

export type TipResult =
  | { ok: true; message: PostedMessage; newBalance: number }
  | { ok: false; status: number; error: string };

async function resolveRecipient(
  access: ChatAccess,
  handle: string | null,
): Promise<{ id: string; handle: string | null } | { error: string }> {
  if (access.kind === 'dm') {
    if (access.isSelf || !access.otherId) return { error: "You can't tip yourself" };
    const u = await prisma.user.findUnique({
      where: { id: access.otherId },
      select: { id: true, handle: true },
    });
    return u ?? { error: 'Recipient not found' };
  }
  if (!handle) return { error: 'Say who to tip: /tip 50 @name' };
  const member = await prisma.groupChatMember.findFirst({
    where: {
      groupId: access.id,
      user: {
        OR: [
          { handle: { equals: handle, mode: 'insensitive' } },
          { username: { equals: handle, mode: 'insensitive' } },
        ],
      },
    },
    select: { user: { select: { id: true, handle: true } } },
  });
  if (!member) return { error: `Nobody in this group is called @${handle}` };
  if (member.user.id === access.viewerId) return { error: "You can't tip yourself" };
  return member.user;
}

export async function sendChatTip(
  access: ChatAccess,
  args: { amount: number; handle: string | null; senderName: string },
): Promise<TipResult> {
  const hold = await getRecoveryHold(access.viewerId);
  if (hold.active) {
    return {
      ok: false,
      status: 403,
      error: 'This account was recently recovered. Coin transfers are paused for 72 hours.',
    };
  }
  const recipient = await resolveRecipient(access, args.handle);
  if ('error' in recipient) return { ok: false, status: 400, error: recipient.error };

  try {
    await transferCoins(access.viewerId, recipient.id, args.amount, {
      type: 'TIP',
      note: 'Tip in chat',
      entityType: 'chat',
      entityId: access.id,
    });
  } catch (e) {
    if (
      e instanceof InsufficientFundsError ||
      (e instanceof Error && e.message === 'INSUFFICIENT_COINS')
    ) {
      return { ok: false, status: 400, error: 'Not enough coins' };
    }
    throw e;
  }

  await createNotification({
    userId: recipient.id,
    actorId: access.viewerId,
    type: 'SYSTEM',
    entityType: 'tip',
    preview: `${args.senderName} tipped you 🪙 ${args.amount}`,
    link: access.kind === 'dm' ? `/messages/${access.id}` : `/groups/${access.id}`,
  });
  await grantAchievement(access.viewerId, 'economy.first_tip_sent');
  await grantAchievement(recipient.id, 'economy.first_tip_received');

  const message = await postSystemLine(access, access.viewerId, {
    action: 'tip',
    amount: args.amount,
    fromId: access.viewerId,
    toId: recipient.id,
  });
  const profile = await prisma.userProfile.findUnique({
    where: { userId: access.viewerId },
    select: { coins: true },
  });
  return { ok: true, message, newBalance: Number(profile?.coins ?? 0) };
}
