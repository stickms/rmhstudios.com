/**
 * Coin staking (#18). A simple interest-bearing vault: staked principal earns
 * APR, accrued lazily so no background job is needed. Every deposit/withdraw
 * first rolls elapsed time into `accrued`.
 */

import { prisma } from '@/lib/prisma.server';

export const STAKING_APR = 0.12; // 12% annual, simple interest on principal
const MS_PER_YEAR = 365 * 24 * 60 * 60 * 1000;

export interface StakeView {
  principal: number;
  accrued: number;
  apr: number;
}

/** Pending (un-rolled) interest for a principal over an elapsed window. */
export function pendingInterest(principal: number, sinceMs: number, now = Date.now()): number {
  if (principal <= 0) return 0;
  const elapsed = Math.max(0, now - sinceMs);
  return Math.floor((principal * STAKING_APR * elapsed) / MS_PER_YEAR);
}

/** Current stake view including interest that has accrued since last roll-up. */
export async function getStake(userId: string): Promise<StakeView> {
  const stake = await prisma.coinStake.findUnique({ where: { userId } });
  if (!stake) return { principal: 0, accrued: 0, apr: STAKING_APR };
  const pending = pendingInterest(stake.principal, stake.lastAccrued.getTime());
  return { principal: stake.principal, accrued: stake.accrued + pending, apr: STAKING_APR };
}

/** Move `amount` coins from the wallet into the stake (rolls interest first). */
export async function deposit(userId: string, amount: number): Promise<StakeView> {
  return prisma.$transaction(async (tx) => {
    const profile = await tx.userProfile.upsert({
      where: { userId },
      create: { userId, coins: 10 },
      update: {},
      select: { coins: true },
    });
    if (profile.coins < amount) throw new Error('INSUFFICIENT_COINS');

    const existing = await tx.coinStake.findUnique({ where: { userId } });
    const now = new Date();
    const rolled = existing ? existing.accrued + pendingInterest(existing.principal, existing.lastAccrued.getTime(), now.getTime()) : 0;
    const principal = (existing?.principal ?? 0) + amount;

    await tx.userProfile.update({ where: { userId }, data: { coins: { decrement: amount } } });
    const stake = await tx.coinStake.upsert({
      where: { userId },
      create: { userId, principal: amount, accrued: 0, lastAccrued: now },
      update: { principal, accrued: rolled, lastAccrued: now },
    });
    return { principal: stake.principal, accrued: stake.accrued, apr: STAKING_APR };
  });
}

/**
 * Withdraw from the vault. Accrued interest is always paid out in full first;
 * `amount` is taken from principal (0 = interest only). Returns the new wallet
 * balance and remaining stake.
 */
export async function withdraw(
  userId: string,
  amount: number
): Promise<{ balance: number; stake: StakeView; paidOut: number }> {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.coinStake.findUnique({ where: { userId } });
    if (!existing) throw new Error('NO_STAKE');
    if (amount > existing.principal) throw new Error('AMOUNT_TOO_HIGH');

    const now = new Date();
    const rolled = existing.accrued + pendingInterest(existing.principal, existing.lastAccrued.getTime(), now.getTime());
    const paidOut = rolled + amount; // all interest + requested principal
    const remainingPrincipal = existing.principal - amount;

    const profile = await tx.userProfile.upsert({
      where: { userId },
      create: { userId, coins: 10 + paidOut },
      update: { coins: { increment: paidOut } },
      select: { coins: true },
    });

    const stake = await tx.coinStake.update({
      where: { userId },
      data: { principal: remainingPrincipal, accrued: 0, lastAccrued: now },
    });

    if (paidOut > 0) {
      await tx.coinTransaction.create({
        data: {
          recipientId: userId,
          amount: paidOut,
          type: 'REWARD',
          entityType: 'staking',
          entityId: 'withdraw',
          note: 'Staking withdrawal',
        },
      });
    }

    return {
      balance: profile.coins,
      stake: { principal: stake.principal, accrued: stake.accrued, apr: STAKING_APR },
      paidOut,
    };
  });
}
