/**
 * Gifting v2 — peer-to-peer coin gifts (§9).
 *
 * Distinct from gift *memberships* (`lib/gifting/gift.server.ts`): this is a
 * pure coin transfer between two users, recorded as a single `GIFT` ledger row.
 * It is a UX layer over the existing GIFT transaction type — no faucet/sink
 * pressure, and `GIFT` is already excluded from creator "earned" derivation, so
 * gifts stay social rather than a monetization path.
 *
 * Guardrails (design §9): self-gift blocked, recipients can opt out
 * (`UserProfile.receiveGifts`), amount bounded {@link GIFT_MIN}..{@link GIFT_MAX},
 * and a daily per-sender cap ({@link GIFT_DAILY_CAP}) to defuse begging/pressure
 * dynamics.
 */

import { prisma } from '@/lib/prisma.server';
import { debitCoins, creditCoins, EscrowError } from '@/lib/wager/escrow.server';
import { createNotification } from '@/lib/notifications.server';

export const GIFT_MIN = 10;
export const GIFT_MAX = 10_000;
export const GIFT_NOTE_MAX = 280;
/** Max distinct coin gifts a single user may send per UTC day. */
export const GIFT_DAILY_CAP = 10;

export type CoinGiftErrorCode = 'SELF' | 'DISABLED' | 'INSUFFICIENT_COINS' | 'CAP' | 'INVALID';

/** Typed failure so the API route can map each cause to an HTTP status. */
export class CoinGiftError extends Error {
  constructor(
    public readonly code: CoinGiftErrorCode,
    message?: string,
  ) {
    super(message ?? code);
    this.name = 'CoinGiftError';
  }
}

export interface SendCoinGiftParams {
  gifterId: string;
  recipientId: string;
  amount: number;
  note?: string;
  /** When true, tags the ledger row so the notification can offer a "show off". */
  public?: boolean;
}

/** Midnight (UTC) of the given day — the window boundary for the daily cap. */
function startOfUtcDay(d = new Date()): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/**
 * Transfer `amount` coins from `gifterId` to `recipientId` as a gift.
 *
 * Throws {@link CoinGiftError} for every anticipated failure; the atomic debit /
 * credit / ledger write happen inside one transaction so a gift can never mint
 * or lose coins.
 */
export async function sendCoinGift(params: SendCoinGiftParams): Promise<{ ok: true }> {
  const { gifterId, recipientId } = params;
  const amount = Math.trunc(params.amount);
  const note = params.note?.trim().slice(0, GIFT_NOTE_MAX) || undefined;

  if (!Number.isInteger(amount) || amount < GIFT_MIN || amount > GIFT_MAX) {
    throw new CoinGiftError('INVALID', `Amount must be between ${GIFT_MIN} and ${GIFT_MAX}`);
  }
  if (gifterId === recipientId) throw new CoinGiftError('SELF');

  // Recipient must exist and accept gifts. (No profile row yet ⇒ default
  // receiveGifts=true, which is fine — debit/credit create the row lazily.)
  const recipient = await prisma.user.findUnique({
    where: { id: recipientId },
    select: { id: true, profile: { select: { receiveGifts: true } } },
  });
  if (!recipient) throw new CoinGiftError('INVALID', 'Recipient not found');
  if (recipient.profile && recipient.profile.receiveGifts === false) {
    throw new CoinGiftError('DISABLED');
  }

  // Daily per-sender cap: count today's coin-gift ledger rows from this gifter.
  // Scoped to entityType 'gift' so gift *memberships* don't consume the cap.
  const sentToday = await prisma.coinTransaction.count({
    where: {
      senderId: gifterId,
      type: 'GIFT',
      entityType: 'gift',
      createdAt: { gte: startOfUtcDay() },
    },
  });
  if (sentToday >= GIFT_DAILY_CAP) throw new CoinGiftError('CAP');

  try {
    await prisma.$transaction(async (tx) => {
      // Conditional debit guards overdraft under concurrency (see escrow.server).
      await debitCoins(tx, gifterId, amount);
      await creditCoins(tx, recipientId, amount);
      await tx.coinTransaction.create({
        data: {
          senderId: gifterId,
          recipientId,
          amount,
          type: 'GIFT',
          note: note ?? null,
          entityType: 'gift',
          entityId: params.public ? 'public' : 'private',
        },
      });
    });
  } catch (err) {
    if (err instanceof EscrowError && err.code === 'INSUFFICIENT_COINS') {
      throw new CoinGiftError('INSUFFICIENT_COINS');
    }
    throw err;
  }

  // Best-effort notify — a notification failure must never undo a settled gift.
  await createNotification({
    userId: recipientId,
    actorId: gifterId,
    type: 'SYSTEM',
    entityType: 'gift',
    entityId: gifterId,
    preview: note
      ? `🎁 You received a gift of ${amount} coins: “${note.slice(0, 120)}”`
      : `🎁 You received a gift of ${amount} coins!`,
    link: '/wallet',
  }).catch(() => {});

  return { ok: true };
}
