import type { Prisma, PrismaClient, RedemptionRequest } from '@prisma/client';
import { prisma } from '@/lib/prisma.server';
import { logAdminAction } from '@/lib/admin-audit.server';
import { notifyAdminsOfReview } from '@/lib/admin-review.server';
import { createNotification } from '@/lib/notifications.server';
import {
  MIN_PAYOUT_COINS,
  MIN_REDEMPTION_COINS,
  redemptionCost,
  type RequestRedemptionInput,
} from './redemption-schema';

type Db = PrismaClient;

export class RedemptionError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly status = 400,
  ) {
    super(message);
    this.name = 'RedemptionError';
  }
}

// "Earned" coins are those provably from creator activity — tips received,
// coin-membership revenue, and storefront / paywalled-post / build unlock sales.
// It is a DERIVED view over the ledger (there is no stored earned-balance
// column). PURCHASE is overloaded (buyer debits, shop sinks) so we additionally
// constrain entityType. Casino/quest/reward coins are deliberately excluded so
// only real creator earnings are bridgeable to value.
const EARNED_ENTITY_TYPES = ['storefront', 'rmhark', 'build'];

export interface CreatorEarnings {
  /** All-time creator-earned coins (derived from the ledger). */
  lifetimeEarned: number;
  /** Coins already committed to redemptions (pending/approved/fulfilled). */
  redeemed: number;
  /** Earned coins still eligible to redeem. */
  redeemable: number;
  /** The user's actual spendable coin balance (the hard cap on any burn). */
  spendable: number;
}

export async function getCreatorEarnings(userId: string, db: Db = prisma): Promise<CreatorEarnings> {
  const [tipsAndMemberships, purchases, redeemedAgg, profile] = await Promise.all([
    db.coinTransaction.aggregate({
      _sum: { amount: true },
      where: { recipientId: userId, amount: { gt: 0 }, type: { in: ['TIP', 'MEMBERSHIP'] } },
    }),
    db.coinTransaction.aggregate({
      _sum: { amount: true },
      where: {
        recipientId: userId,
        amount: { gt: 0 },
        type: 'PURCHASE',
        entityType: { in: EARNED_ENTITY_TYPES },
      },
    }),
    db.redemptionRequest.aggregate({
      _sum: { amountCoins: true },
      where: { userId, status: { not: 'REJECTED' } },
    }),
    db.userProfile.findUnique({ where: { userId }, select: { coins: true } }),
  ]);

  const lifetimeEarned =
    (tipsAndMemberships._sum.amount ?? 0) + (purchases._sum.amount ?? 0);
  const redeemed = redeemedAgg._sum.amountCoins ?? 0;
  const redeemable = Math.max(0, lifetimeEarned - redeemed);
  const spendable = profile?.coins ?? 0;
  return { lifetimeEarned, redeemed, redeemable, spendable };
}

// ─── Request ──────────────────────────────────────────────────────────────

export async function requestRedemption(
  opts: { userId: string; input: RequestRedemptionInput; isVerified?: boolean },
  db: Db = prisma,
): Promise<RedemptionRequest> {
  const cost = redemptionCost(opts.input);
  if (cost < MIN_REDEMPTION_COINS) {
    throw new RedemptionError(
      `Minimum redemption is ${MIN_REDEMPTION_COINS} coins`,
      'TOO_SMALL',
    );
  }
  if (opts.input.kind === 'PAYOUT') {
    if (!opts.isVerified) {
      throw new RedemptionError('Cash payouts require a verified creator account', 'NOT_VERIFIED', 403);
    }
    if (cost < MIN_PAYOUT_COINS) {
      throw new RedemptionError(`Minimum payout is ${MIN_PAYOUT_COINS} coins`, 'PAYOUT_TOO_SMALL');
    }
  }

  const earnings = await getCreatorEarnings(opts.userId, db);
  if (cost > earnings.redeemable) {
    throw new RedemptionError(
      'You can only redeem coins earned from creator activity (tips, memberships, sales)',
      'EXCEEDS_EARNED',
    );
  }

  try {
    const request = await db.$transaction(async (tx) => {
      // Burn the coins now (immediate sink) so they can't be double-spent while
      // the request is pending. Refunded if an admin rejects it.
      const debit = await tx.userProfile.updateMany({
        where: { userId: opts.userId, coins: { gte: cost } },
        data: { coins: { decrement: cost } },
      });
      if (debit.count === 0) {
        throw new RedemptionError('Not enough coins', 'INSUFFICIENT_COINS');
      }
      // Audit row (excluded from the earned filter by its entityType).
      await tx.coinTransaction.create({
        data: {
          senderId: opts.userId,
          recipientId: opts.userId,
          amount: cost,
          type: 'PURCHASE',
          entityType: 'redemption',
          note: `Redemption requested (${opts.input.kind})`,
        },
      });
      return tx.redemptionRequest.create({
        data: {
          userId: opts.userId,
          kind: opts.input.kind,
          amountCoins: cost,
          tierGranted: opts.input.kind === 'SUB_CREDIT' ? opts.input.tier : null,
          monthsGranted: opts.input.kind === 'SUB_CREDIT' ? opts.input.months : null,
          note: opts.input.note?.slice(0, 500) ?? null,
          status: 'PENDING',
        },
      });
    });

    void notifyAdminsOfReview({
      preview: `New ${opts.input.kind} redemption for ${cost} coins`,
      kind: 'redemptions',
      link: '/admin/redemptions',
    }).catch(() => {});
    return request;
  } catch (err) {
    if (err instanceof RedemptionError) throw err;
    throw err;
  }
}

// ─── Read ────────────────────────────────────────────────────────────────

export async function listMyRedemptions(
  userId: string,
  db: Db = prisma,
): Promise<RedemptionRequest[]> {
  return db.redemptionRequest.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: 30,
  });
}

export async function listPendingRedemptions(
  opts: { take?: number } = {},
  db: Db = prisma,
): Promise<
  (RedemptionRequest & { user: { id: string; name: string | null; handle: string | null } })[]
> {
  return db.redemptionRequest.findMany({
    where: { status: 'PENDING' },
    orderBy: { createdAt: 'asc' },
    take: Math.min(Math.max(opts.take ?? 30, 1), 60),
    include: { user: { select: { id: true, name: true, handle: true } } },
  });
}

// ─── Admin review ───────────────────────────────────────────────────────────

async function grantSubMonths(
  tx: Prisma.TransactionClient,
  userId: string,
  tier: string,
  months: number,
): Promise<void> {
  const existing = await tx.giftMembership.findFirst({
    where: { userId, tier, expiresAt: { gt: new Date() } },
    orderBy: { expiresAt: 'desc' },
  });
  const base = existing ? existing.expiresAt : new Date();
  const expiresAt = new Date(base.getTime() + months * 30 * 24 * 60 * 60 * 1000);
  if (existing) {
    await tx.giftMembership.update({ where: { id: existing.id }, data: { expiresAt } });
  } else {
    await tx.giftMembership.create({ data: { userId, gifterId: null, tier, expiresAt } });
  }
}

export async function reviewRedemption(
  opts: {
    id: string;
    action: 'approve' | 'reject' | 'fulfill';
    adminId: string;
    note?: string;
    externalRef?: string;
  },
  db: Db = prisma,
): Promise<{ status: string }> {
  const finalStatus = await db.$transaction(async (tx) => {
    const req = await tx.redemptionRequest.findUnique({ where: { id: opts.id } });
    if (!req) throw new RedemptionError('Request not found', 'NOT_FOUND', 404);
    if (req.status === 'FULFILLED' || req.status === 'REJECTED') {
      return req.status; // idempotent — already terminal
    }

    if (opts.action === 'reject') {
      // Refund the burned coins.
      await tx.userProfile.upsert({
        where: { userId: req.userId },
        create: { userId: req.userId, coins: 10 + req.amountCoins },
        update: { coins: { increment: req.amountCoins } },
      });
      await tx.coinTransaction.create({
        data: {
          senderId: null,
          recipientId: req.userId,
          amount: req.amountCoins,
          type: 'REWARD',
          entityType: 'redemption',
          note: 'Redemption rejected refund',
        },
      });
      await tx.redemptionRequest.update({
        where: { id: req.id },
        data: {
          status: 'REJECTED',
          reviewedById: opts.adminId,
          reviewNote: opts.note?.slice(0, 500) ?? null,
          reviewedAt: new Date(),
        },
      });
      return 'REJECTED';
    }

    // approve / fulfill → grant the value (coins already burned at request time).
    if (req.kind === 'SUB_CREDIT' && req.tierGranted && req.monthsGranted) {
      await grantSubMonths(tx, req.userId, req.tierGranted, req.monthsGranted);
    }
    const terminal = opts.action === 'fulfill' || req.kind === 'SUB_CREDIT';
    await tx.redemptionRequest.update({
      where: { id: req.id },
      data: {
        status: terminal ? 'FULFILLED' : 'APPROVED',
        reviewedById: opts.adminId,
        reviewNote: opts.note?.slice(0, 500) ?? req.reviewNote,
        externalRef: opts.externalRef?.slice(0, 120) ?? req.externalRef,
        reviewedAt: new Date(),
        fulfilledAt: terminal ? new Date() : req.fulfilledAt,
      },
    });
    return terminal ? 'FULFILLED' : 'APPROVED';
  });

  await logAdminAction(opts.adminId, `redemption.${opts.action}`, {
    targetType: 'redemption',
    targetId: opts.id,
  });
  // Tell the creator.
  const req = await db.redemptionRequest.findUnique({ where: { id: opts.id } });
  if (req) {
    void createNotification({
      userId: req.userId,
      type: 'SYSTEM',
      entityType: 'redemption',
      entityId: req.id,
      preview:
        finalStatus === 'REJECTED'
          ? 'Your redemption was declined and your coins were refunded'
          : finalStatus === 'FULFILLED'
            ? 'Your redemption was fulfilled 🎉'
            : 'Your redemption was approved',
      link: '/create?tab=earnings',
    }).catch(() => {});
  }
  return { status: finalStatus };
}
