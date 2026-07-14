import { prisma } from '@/lib/prisma.server';

const PERIOD_DAYS = 30;

export interface MembershipStatus {
  /** The creator's monthly price in coins, or null if memberships are off. */
  priceCoins: number | null;
  /** Number of currently-active members. */
  memberCount: number;
  /** Whether the viewer has an active membership (false when signed out). */
  isMember: boolean;
  /** The viewer's membership expiry, if any. */
  expiresAt: string | null;
}

/** Resolve membership state for a creator, from a viewer's perspective. */
export async function getMembershipStatus(
  creatorId: string,
  priceCoins: number | null,
  viewerId: string | null,
): Promise<MembershipStatus> {
  const now = new Date();
  const [memberCount, viewerMembership] = await Promise.all([
    prisma.creatorMembership.count({ where: { creatorId, expiresAt: { gt: now } } }),
    viewerId
      ? prisma.creatorMembership.findUnique({
          where: { creatorId_supporterId: { creatorId, supporterId: viewerId } },
          select: { expiresAt: true },
        })
      : Promise.resolve(null),
  ]);

  const active = !!viewerMembership && viewerMembership.expiresAt > now;
  return {
    priceCoins: priceCoins && priceCoins > 0 ? priceCoins : null,
    memberCount,
    isMember: active,
    expiresAt: viewerMembership ? viewerMembership.expiresAt.toISOString() : null,
  };
}

export type JoinResult =
  | { ok: true; expiresAt: string; newBalance: number }
  | { ok: false; error: string; status: number };

/**
 * Join or renew a coin-funded membership: debit the supporter, credit the
 * creator, record the ledger entry, and extend the membership by 30 days. The
 * debit uses a conditional atomic decrement (WHERE coins >= price) so
 * concurrent joins can't overdraft — mirrors the tip flow.
 */
export async function joinOrRenewMembership(
  creatorId: string,
  supporterId: string,
): Promise<JoinResult> {
  if (creatorId === supporterId) {
    return { ok: false, error: 'You cannot become a member of yourself', status: 400 };
  }

  const creator = await prisma.userProfile.findUnique({
    where: { userId: creatorId },
    select: { membershipPriceCoins: true },
  });
  const price = creator?.membershipPriceCoins ?? 0;
  if (!price || price <= 0) {
    return { ok: false, error: 'This creator is not offering memberships', status: 400 };
  }

  try {
    const now = new Date();
    const expiresAt = await prisma.$transaction(async (tx) => {
      await tx.userProfile.upsert({
        where: { userId: supporterId },
        create: { userId: supporterId, coins: 10 },
        update: {},
      });
      const debit = await tx.userProfile.updateMany({
        where: { userId: supporterId, coins: { gte: price } },
        data: { coins: { decrement: price } },
      });
      if (debit.count === 0) throw new Error('INSUFFICIENT_COINS');

      await tx.userProfile.upsert({
        where: { userId: creatorId },
        create: { userId: creatorId, coins: 10 + price },
        update: { coins: { increment: price } },
      });
      await tx.coinTransaction.create({
        data: {
          senderId: supporterId,
          recipientId: creatorId,
          amount: price,
          type: 'MEMBERSHIP',
          entityType: 'profile',
          entityId: creatorId,
        },
      });

      // Extend from the later of now / current expiry, so renewing early stacks.
      const existing = await tx.creatorMembership.findUnique({
        where: { creatorId_supporterId: { creatorId, supporterId } },
        select: { expiresAt: true },
      });
      const base = existing && existing.expiresAt > now ? existing.expiresAt : now;
      const nextExpiry = new Date(base.getTime() + PERIOD_DAYS * 24 * 60 * 60 * 1000);

      await tx.creatorMembership.upsert({
        where: { creatorId_supporterId: { creatorId, supporterId } },
        create: { creatorId, supporterId, priceCoins: price, startedAt: now, expiresAt: nextExpiry },
        update: { priceCoins: price, expiresAt: nextExpiry },
      });
      return nextExpiry;
    });

    const profile = await prisma.userProfile.findUnique({
      where: { userId: supporterId },
      select: { coins: true },
    });
    return { ok: true, expiresAt: expiresAt.toISOString(), newBalance: profile?.coins ?? 0 };
  } catch (error) {
    if (error instanceof Error && error.message === 'INSUFFICIENT_COINS') {
      return { ok: false, error: 'Not enough coins', status: 400 };
    }
    console.error('Membership join error:', error);
    return { ok: false, error: 'Internal Server Error', status: 500 };
  }
}
