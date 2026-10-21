/**
 * Coin staking (#18). A simple interest-bearing vault: staked principal earns
 * APR, accrued lazily so no background job is needed. Every deposit/withdraw
 * first rolls elapsed time into `accrued` — or, with `autoReinvest` on, into
 * `principal`, so the interest itself earns interest.
 */

import { prisma } from '@/lib/prisma.server';
import { MAX_TRANSACTION, creditCoins, debitCoins, getBalance } from '@/lib/economy/ledger.server';

export const STAKING_APR = 0.12; // 12% annual, simple interest on principal
const MS_PER_YEAR = 365 * 24 * 60 * 60 * 1000;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Largest principal a vault holds: one ledger move, so a full withdrawal always
 * fits in a single transaction. Reinvestment stops growing principal here (the
 * excess is held as claimable interest) and deposits that would cross it are
 * refused.
 */
export const MAX_STAKE = MAX_TRANSACTION;

export interface StakeView {
  principal: number;
  accrued: number;
  apr: number;
  autoReinvest: boolean;
}

interface StakeRow {
  principal: number;
  accrued: number;
  autoReinvest: boolean;
  lastAccrued: Date;
}

/** The columns are BIGINT; every value fits a JS number well below MAX_SAFE_INTEGER. */
function toRow(stake: { principal: bigint; accrued: bigint; autoReinvest: boolean; lastAccrued: Date }): StakeRow {
  return { ...stake, principal: Number(stake.principal), accrued: Number(stake.accrued) };
}

/** Pending (un-rolled) interest for a principal over an elapsed window. */
export function pendingInterest(principal: number, sinceMs: number, now = Date.now()): number {
  if (principal <= 0) return 0;
  const elapsed = Math.max(0, now - sinceMs);
  return Math.floor((principal * STAKING_APR * elapsed) / MS_PER_YEAR);
}

/**
 * Interest earned while reinvesting: compounded daily, prorated for partial
 * days. Multiplicative, so the result does not depend on how often it is
 * rolled — a stake that is touched hourly and one left alone for a month end
 * up the same (bar sub-coin flooring).
 */
export function compoundedInterest(principal: number, sinceMs: number, now = Date.now()): number {
  if (principal <= 0) return 0;
  const days = Math.max(0, now - sinceMs) / MS_PER_DAY;
  return Math.floor(principal * (Math.pow(1 + STAKING_APR / 365, days) - 1));
}

/** Roll elapsed interest into the row's balances under its current mode. */
function roll(stake: StakeRow, now: number): { principal: number; accrued: number } {
  const since = stake.lastAccrued.getTime();
  if (!stake.autoReinvest) {
    return { principal: stake.principal, accrued: stake.accrued + pendingInterest(stake.principal, since, now) };
  }
  const grown = stake.principal + compoundedInterest(stake.principal, since, now);
  const principal = Math.min(grown, MAX_STAKE);
  return { principal, accrued: stake.accrued + (grown - principal) };
}

function view(s: { principal: number; accrued: number; autoReinvest: boolean }): StakeView {
  return { principal: s.principal, accrued: s.accrued, apr: STAKING_APR, autoReinvest: s.autoReinvest };
}

/** Current stake view including interest that has accrued since last roll-up. */
export async function getStake(userId: string): Promise<StakeView> {
  const stake = await prisma.coinStake.findUnique({ where: { userId } });
  if (!stake) return view({ principal: 0, accrued: 0, autoReinvest: false });
  return view({ ...roll(toRow(stake), Date.now()), autoReinvest: stake.autoReinvest });
}

/** Move `amount` coins from the wallet into the stake (rolls interest first). */
export async function deposit(userId: string, amount: number): Promise<StakeView> {
  // Defense-in-depth: a non-positive amount would turn the conditional decrement
  // below into a credit (coin minting), so reject it here regardless of the route.
  if (!Number.isInteger(amount) || amount <= 0) throw new Error('INVALID_AMOUNT');
  return prisma.$transaction(async (tx) => {
    const existing = await tx.coinStake.findUnique({ where: { userId } });
    const now = new Date();
    const rolled = existing ? roll(toRow(existing), now.getTime()) : { principal: 0, accrued: 0 };
    const principal = rolled.principal + amount;
    if (principal > MAX_STAKE) throw new Error('STAKE_TOO_LARGE');

    // Deposit: coins leave the wallet for the vault. Recorded as a sink so the
    // withdrawal faucet on the other side has a matching entry and the vault's
    // net effect on supply is measurable.
    await debitCoins(userId, amount, {
      tx,
      type: 'REWARD',
      entityType: 'staking',
      entityId: 'deposit',
      note: 'Staking deposit',
    });

    const stake = await tx.coinStake.upsert({
      where: { userId },
      create: { userId, principal: amount, accrued: 0, lastAccrued: now },
      update: { principal, accrued: rolled.accrued, lastAccrued: now },
    });
    return view(toRow(stake));
  });
}

/**
 * Turn auto-reinvest on or off. Elapsed interest is rolled under the old mode
 * first; turning it on also moves any interest already waiting to be claimed
 * into principal, since "reinvest my interest" plainly includes that.
 */
export async function setAutoReinvest(userId: string, enabled: boolean): Promise<StakeView> {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.coinStake.findUnique({ where: { userId } });
    const now = new Date();
    if (!existing) {
      const stake = await tx.coinStake.create({
        data: { userId, principal: 0, accrued: 0, autoReinvest: enabled, lastAccrued: now },
      });
      return view(toRow(stake));
    }

    let { principal, accrued } = roll(toRow(existing), now.getTime());
    if (enabled) {
      const moved = Math.min(accrued, MAX_STAKE - principal);
      principal += moved;
      accrued -= moved;
    }
    const stake = await tx.coinStake.update({
      where: { userId },
      data: { principal, accrued, autoReinvest: enabled, lastAccrued: now },
    });
    return view(toRow(stake));
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

    const now = new Date();
    const rolled = roll(toRow(existing), now.getTime());
    // Checked against the rolled principal: with auto-reinvest on, interest
    // compounded since the last write is withdrawable principal too.
    if (amount > rolled.principal) throw new Error('AMOUNT_TOO_HIGH');

    const paidOut = rolled.accrued + amount; // all interest + requested principal
    const remainingPrincipal = rolled.principal - amount;

    if (paidOut > 0) {
      await creditCoins(userId, paidOut, {
        tx,
        type: 'REWARD',
        entityType: 'staking',
        entityId: 'withdraw',
        note: 'Staking withdrawal',
      });
    }
    const balance = await getBalance(userId, tx);

    const stake = await tx.coinStake.update({
      where: { userId },
      data: { principal: remainingPrincipal, accrued: 0, lastAccrued: now },
    });

    return { balance, stake: view(toRow(stake)), paidOut };
  });
}
