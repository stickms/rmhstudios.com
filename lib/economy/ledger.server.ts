/**
 * The coin ledger — the ONLY place `UserProfile.coins` may change in the web
 * tier. Thin binding of `ledger-core.ts` to the shared Prisma singleton; the
 * rationale, invariants and failure modes are documented there.
 *
 * The realtime tier holds its own Prisma client and imports `ledger-core.ts`
 * directly, so no second connection pool is opened inside the socket server.
 */

import { prisma } from '@/lib/prisma.server';
import {
  creditCoinsOn,
  debitCoinsOn,
  transferCoinsOn,
  getBalanceOn,
  STARTING_BALANCE,
  type Db,
  type LedgerOptions,
  type LedgerResult,
} from '@/lib/economy/ledger-core';

export {
  MAX_TRANSACTION,
  STARTING_BALANCE,
  InsufficientFundsError,
  InvalidAmountError,
} from '@/lib/economy/ledger-core';

export type { Db, LedgerOptions, LedgerResult } from '@/lib/economy/ledger-core';

/** FAUCET — create `amount` coins and credit them to `userId`. */
export function creditCoins(
  userId: string,
  amount: number,
  opts: LedgerOptions = {}
): Promise<LedgerResult> {
  return creditCoinsOn(prisma, userId, amount, opts);
}

/** SINK — destroy `amount` coins held by `userId`. */
export function debitCoins(
  userId: string,
  amount: number,
  opts: LedgerOptions = {}
): Promise<LedgerResult> {
  return debitCoinsOn(prisma, userId, amount, opts);
}

/** TRANSFER — move `amount` coins between users; supply is conserved. */
export function transferCoins(
  fromUserId: string,
  toUserId: string,
  amount: number,
  opts: LedgerOptions & { fee?: number } = {}
): Promise<LedgerResult> {
  return transferCoinsOn(prisma, fromUserId, toUserId, amount, opts);
}

/** Current balance, or 0 for a user with no profile row yet. */
export function getBalance(userId: string, db: Db = prisma): Promise<number> {
  return getBalanceOn(db, userId);
}

export interface Reconciliation {
  userId: string;
  /** Balance as stored on the profile. */
  balance: number;
  /** Balance implied by the ledger: starting grant + credits − debits. */
  ledgerBalance: number;
  /** `balance - ledgerBalance`. Zero means the ledger explains the balance. */
  drift: number;
  ok: boolean;
}

/**
 * Check that a user's stored balance matches what the ledger says it should be.
 *
 * The migration that introduced the sink encoding also converted the historical
 * negative-amount rows, so most history reconciles. What cannot be recovered is
 * spending that never wrote a row at all — those accounts carry permanent
 * drift. The number that matters is whether drift GROWS: after the ledger
 * became authoritative it should be frozen.
 */
export async function reconcileUser(userId: string): Promise<Reconciliation> {
  const [profile, credits, debits] = await Promise.all([
    prisma.userProfile.findUnique({ where: { userId }, select: { coins: true } }),
    prisma.coinTransaction.aggregate({
      where: { recipientId: userId },
      _sum: { amount: true },
    }),
    prisma.coinTransaction.aggregate({
      where: { senderId: userId },
      _sum: { amount: true },
    }),
  ]);

  const balance = profile?.coins ?? 0;
  const ledgerBalance =
    STARTING_BALANCE + (credits._sum.amount ?? 0) - (debits._sum.amount ?? 0);
  const drift = balance - ledgerBalance;

  return { userId, balance, ledgerBalance, drift, ok: drift === 0 };
}
