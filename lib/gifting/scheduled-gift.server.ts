/**
 * Scheduled gift delivery — server side (C7).
 *
 * ── Money ───────────────────────────────────────────────────────────────────
 *
 * The sender pays the item's full price at SEND time, in the same transaction
 * that creates the gift row (a **SINK** — the recipient receives an item, not
 * coins, exactly like `giftMembership`). From then on the coins are spent, and
 * the gift can end three ways, each of which is decided by one conditional
 * claim on `status = SCHEDULED`:
 *
 *   DELIVERED  the delivery job grants the item;
 *   CANCELLED  the sender backs out before delivery → refund;
 *   REFUNDED   at delivery the item can no longer be granted (the recipient
 *              bought it in the meantime, or deleted their account) → refund.
 *
 * Because every exit claims the same `SCHEDULED` state, they are mutually
 * exclusive, and the one refund key `sgift-refund:<id>` makes a refund
 * single-use even if two code paths somehow both reached it.
 */
import { prisma } from '@/lib/prisma.server';
import { creditCoins, debitCoins, InsufficientFundsError } from '@/lib/economy/ledger.server';
import { createNotification } from '@/lib/notifications.server';
import { getShopItem } from '@/lib/shop/catalog';
import { userChipSelect } from '@/lib/user-display';
import {
  SCHEDULE_MAX_LEAD_MS,
  SCHEDULE_MIN_LEAD_MS,
  SCHEDULED_GIFT_MAX_PENDING,
  type ReceivedGiftView,
  type ScheduleGiftInput,
  type ScheduledGiftParty,
  type ScheduledGiftStatus,
  type ScheduledGiftsPayload,
  type SentGiftView,
} from '@/lib/gifting/scheduled-gift';

export type ScheduledGiftErrorCode =
  | 'UNKNOWN_ITEM'
  | 'NOT_GIFTABLE'
  | 'NO_SUCH_MEMBER'
  | 'SELF'
  | 'BLOCKED'
  | 'RECIPIENT_OWNS'
  | 'DUPLICATE'
  | 'BAD_DATE'
  | 'TOO_MANY'
  | 'INSUFFICIENT_COINS'
  | 'NOT_FOUND'
  | 'BAD_STATE';

export class ScheduledGiftError extends Error {
  constructor(readonly code: ScheduledGiftErrorCode) {
    super(code);
    this.name = 'ScheduledGiftError';
  }
}

export const sgiftPayRefId = (id: string) => `sgift-pay:${id}`;
export const sgiftRefundRefId = (id: string) => `sgift-refund:${id}`;

// ── send ─────────────────────────────────────────────────────────────────────

export async function scheduleGift(
  senderId: string,
  input: ScheduleGiftInput,
  now: Date = new Date(),
): Promise<{ id: string; price: number }> {
  const item = getShopItem(input.itemId);
  if (!item) throw new ScheduledGiftError('UNKNOWN_ITEM');
  // Tier-gated items are bought through a tier check the recipient may not pass.
  if (item.requiresTier || item.price <= 0) throw new ScheduledGiftError('NOT_GIFTABLE');

  const deliverAt = new Date(input.deliverAt);
  const lead = deliverAt.getTime() - now.getTime();
  if (!Number.isFinite(lead) || lead < SCHEDULE_MIN_LEAD_MS || lead > SCHEDULE_MAX_LEAD_MS) {
    throw new ScheduledGiftError('BAD_DATE');
  }

  const recipient = await prisma.user.findFirst({
    where: { handle: { equals: input.recipient, mode: 'insensitive' } },
    select: { id: true },
  });
  if (!recipient) throw new ScheduledGiftError('NO_SUCH_MEMBER');
  if (recipient.id === senderId) throw new ScheduledGiftError('SELF');

  const [blocked, owns, dup, pending] = await Promise.all([
    prisma.userBlock.findFirst({
      where: {
        OR: [
          { blockerId: senderId, blockedId: recipient.id },
          { blockerId: recipient.id, blockedId: senderId },
        ],
      },
      select: { id: true },
    }),
    prisma.userInventory.findUnique({
      where: { userId_itemId: { userId: recipient.id, itemId: item.id } },
      select: { id: true },
    }),
    prisma.scheduledGift.findFirst({
      where: { recipientId: recipient.id, itemId: item.id, status: 'SCHEDULED' },
      select: { id: true },
    }),
    prisma.scheduledGift.count({ where: { senderId, status: 'SCHEDULED' } }),
  ]);
  if (blocked) throw new ScheduledGiftError('BLOCKED');
  if (owns) throw new ScheduledGiftError('RECIPIENT_OWNS');
  if (dup) throw new ScheduledGiftError('DUPLICATE');
  if (pending >= SCHEDULED_GIFT_MAX_PENDING) throw new ScheduledGiftError('TOO_MANY');

  try {
    return await prisma.$transaction(async (tx) => {
      // Row first: its id is the ledger key, so every paid gift is attributable.
      const row = await tx.scheduledGift.create({
        data: {
          senderId,
          recipientId: recipient.id,
          itemId: item.id,
          price: item.price,
          message: input.message || null,
          deliverAt,
        },
        select: { id: true },
      });
      await debitCoins(senderId, item.price, {
        tx,
        type: 'GIFT',
        note: `Scheduled gift: ${item.name}`,
        entityType: 'sgift',
        entityId: row.id,
        idempotencyKey: sgiftPayRefId(row.id),
      });
      return { id: row.id, price: item.price };
    });
  } catch (err) {
    if (err instanceof InsufficientFundsError) throw new ScheduledGiftError('INSUFFICIENT_COINS');
    throw err;
  }
}

// ── cancel ───────────────────────────────────────────────────────────────────

/** Sender backs out before delivery; the full price comes back. */
export async function cancelScheduledGift(senderId: string, id: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const claim = await tx.scheduledGift.updateMany({
      where: { id, senderId, status: 'SCHEDULED' },
      data: { status: 'CANCELLED' },
    });
    if (claim.count === 0) {
      const exists = await tx.scheduledGift.findFirst({
        where: { id, senderId },
        select: { id: true },
      });
      throw new ScheduledGiftError(exists ? 'BAD_STATE' : 'NOT_FOUND');
    }
    const gift = await tx.scheduledGift.findUniqueOrThrow({
      where: { id },
      select: { price: true },
    });
    await creditCoins(senderId, gift.price, {
      tx,
      type: 'GIFT',
      note: 'Scheduled gift cancelled',
      entityType: 'sgift',
      entityId: id,
      idempotencyKey: sgiftRefundRefId(id),
    });
  });
}

// ── delivery job ─────────────────────────────────────────────────────────────

type Outcome = 'delivered' | 'refunded' | 'skipped';

export interface DeliverySweepResult {
  delivered: number;
  refunded: number;
  skipped: number;
  failed: number;
}

/**
 * Deliver every gift whose time has come. Safe to run concurrently with itself
 * and with a cancel: each gift is claimed by a conditional update, and only the
 * claimant acts.
 */
export async function deliverDueGifts(now: Date = new Date()): Promise<DeliverySweepResult> {
  const res: DeliverySweepResult = { delivered: 0, refunded: 0, skipped: 0, failed: 0 };
  const due = await prisma.scheduledGift.findMany({
    where: { status: 'SCHEDULED', deliverAt: { lte: now } },
    select: { id: true },
    orderBy: { deliverAt: 'asc' },
    take: 200,
  });
  for (const { id } of due) {
    try {
      const outcome = await deliverOne(id, now);
      res[outcome] += 1;
    } catch (err) {
      // Left SCHEDULED (the transaction rolled back) and retried next run.
      res.failed += 1;
      console.error('[scheduled-gifts] delivery failed for', id, err);
    }
  }
  return res;
}

async function deliverOne(id: string, now: Date): Promise<Outcome> {
  const settled = await prisma.$transaction(async (tx) => {
    const claim = await tx.scheduledGift.updateMany({
      where: { id, status: 'SCHEDULED', deliverAt: { lte: now } },
      data: { status: 'DELIVERED', deliveredAt: now },
    });
    if (claim.count === 0) return null;

    const gift = await tx.scheduledGift.findUniqueOrThrow({
      where: { id },
      select: { senderId: true, recipientId: true, itemId: true, price: true },
    });
    const item = getShopItem(gift.itemId);
    const owns = gift.recipientId
      ? await tx.userInventory.findUnique({
          where: { userId_itemId: { userId: gift.recipientId, itemId: gift.itemId } },
          select: { id: true },
        })
      : null;

    if (!gift.recipientId || !item || owns) {
      await tx.scheduledGift.update({ where: { id }, data: { status: 'REFUNDED' } });
      await creditCoins(gift.senderId, gift.price, {
        tx,
        type: 'GIFT',
        note: 'Scheduled gift refunded',
        entityType: 'sgift',
        entityId: id,
        idempotencyKey: sgiftRefundRefId(id),
      });
      return { outcome: 'refunded' as const, gift, itemName: item?.name ?? gift.itemId };
    }

    await tx.userInventory.create({
      data: { userId: gift.recipientId, itemId: gift.itemId, kind: item.kind },
    });
    return { outcome: 'delivered' as const, gift, itemName: item.name };
  });

  if (!settled) return 'skipped';

  // Notifications are best-effort and after commit: a failed notification must
  // never undo a delivery.
  if (settled.outcome === 'delivered' && settled.gift.recipientId) {
    await createNotification({
      userId: settled.gift.recipientId,
      actorId: settled.gift.senderId,
      type: 'SYSTEM',
      entityType: 'sgift',
      entityId: id,
      preview: 'You have a gift waiting to be unwrapped!',
      link: '/wallet?tab=gifts',
    });
  } else if (settled.outcome === 'refunded') {
    await createNotification({
      userId: settled.gift.senderId,
      type: 'SYSTEM',
      entityType: 'sgift',
      entityId: id,
      preview: `Your scheduled gift (${settled.itemName}) could not be delivered, so you were refunded.`,
      link: '/wallet?tab=gifts',
    });
  }
  return settled.outcome;
}

// ── reads + unwrap ───────────────────────────────────────────────────────────

function party(
  u: { id: string; handle: string | null; name: string | null } | null,
): ScheduledGiftParty | null {
  return u ? { id: u.id, handle: u.handle, name: u.name } : null;
}

export async function listScheduledGifts(userId: string): Promise<ScheduledGiftsPayload> {
  const [received, sent] = await Promise.all([
    prisma.scheduledGift.findMany({
      where: { recipientId: userId, status: 'DELIVERED' },
      orderBy: { deliveredAt: 'desc' },
      take: 30,
      select: {
        id: true,
        itemId: true,
        message: true,
        deliveredAt: true,
        unwrappedAt: true,
        sender: { select: userChipSelect },
      },
    }),
    prisma.scheduledGift.findMany({
      where: { senderId: userId },
      orderBy: { createdAt: 'desc' },
      take: 30,
      select: {
        id: true,
        itemId: true,
        price: true,
        deliverAt: true,
        status: true,
        unwrappedAt: true,
        recipient: { select: userChipSelect },
      },
    }),
  ]);

  return {
    received: received.map((g): ReceivedGiftView => ({
      id: g.id,
      itemId: g.itemId,
      itemName: getShopItem(g.itemId)?.name ?? g.itemId,
      from: party(g.sender)!,
      deliveredAt: (g.deliveredAt ?? new Date(0)).toISOString(),
      unwrapped: g.unwrappedAt !== null,
      // The note stays sealed until the box is opened — that is the moment.
      message: g.unwrappedAt ? g.message : null,
    })),
    sent: sent.map((g): SentGiftView => ({
      id: g.id,
      itemId: g.itemId,
      itemName: getShopItem(g.itemId)?.name ?? g.itemId,
      price: g.price,
      recipient: party(g.recipient),
      deliverAt: g.deliverAt.toISOString(),
      status: g.status as ScheduledGiftStatus,
      unwrapped: g.unwrappedAt !== null,
    })),
  };
}

/** Open a delivered gift. Idempotent: opening twice returns the same reveal. */
export async function unwrapGift(
  userId: string,
  id: string,
  now: Date = new Date(),
): Promise<{ itemId: string; itemName: string; message: string | null }> {
  await prisma.scheduledGift.updateMany({
    where: { id, recipientId: userId, status: 'DELIVERED', unwrappedAt: null },
    data: { unwrappedAt: now },
  });
  const gift = await prisma.scheduledGift.findFirst({
    where: { id, recipientId: userId, status: 'DELIVERED' },
    select: { itemId: true, message: true },
  });
  if (!gift) throw new ScheduledGiftError('NOT_FOUND');
  return {
    itemId: gift.itemId,
    itemName: getShopItem(gift.itemId)?.name ?? gift.itemId,
    message: gift.message,
  };
}
