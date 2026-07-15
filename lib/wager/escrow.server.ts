import type { Prisma } from '@prisma/client';

// Shared coin-escrow primitives for wager matches and tournaments. Both features
// move coins the same way, so the atomicity contract lives here once.
//
// The concurrency guard is the repo-wide idiom (see api/coins/tip.ts,
// api/coins/bet.ts): a conditional `updateMany` with `coins: { gte: amount }` in
// the WHERE clause. Under READ COMMITTED a losing concurrent debit sees the
// freshly-committed balance and its `count` comes back 0 — no row locks needed.
//
// Every helper takes a transaction client (`Prisma.TransactionClient`) and MUST
// be called inside a `prisma.$transaction(async (tx) => { ... })` so the debit,
// the counterparty credit, and the ledger row commit together or not at all.

export type Tx = Prisma.TransactionClient;

export class EscrowError extends Error {
  constructor(
    message: string,
    public readonly code: 'INSUFFICIENT_COINS' | 'INVALID_AMOUNT',
  ) {
    super(message);
    this.name = 'EscrowError';
  }
}

/**
 * Atomically remove `amount` coins from a user, guarding against overdraft.
 * Throws `EscrowError('INSUFFICIENT_COINS')` if the balance is too low.
 * Defense-in-depth: rejects non-positive / non-integer amounts so a crafted
 * negative "stake" can never mint coins.
 */
export async function debitCoins(tx: Tx, userId: string, amount: number): Promise<void> {
  if (!Number.isInteger(amount) || amount <= 0) {
    throw new EscrowError('Amount must be a positive integer', 'INVALID_AMOUNT');
  }
  // Ensure a profile row exists so the conditional update has something to hit.
  await tx.userProfile.upsert({
    where: { userId },
    create: { userId, coins: 10 },
    update: {},
  });
  const debit = await tx.userProfile.updateMany({
    where: { userId, coins: { gte: amount } },
    data: { coins: { decrement: amount } },
  });
  if (debit.count === 0) {
    throw new EscrowError('Insufficient coins', 'INSUFFICIENT_COINS');
  }
}

/** Atomically add `amount` coins to a user (credit-only; no guard needed). */
export async function creditCoins(tx: Tx, userId: string, amount: number): Promise<void> {
  if (!Number.isInteger(amount) || amount <= 0) return;
  await tx.userProfile.upsert({
    where: { userId },
    create: { userId, coins: 10 + amount },
    update: { coins: { increment: amount } },
  });
}

/**
 * Write a WAGER ledger row so every escrow movement is auditable. `senderId`
 * null denotes a payout from the pot (system → user); a real senderId denotes a
 * transfer between users. Mirrors the CoinTransaction shape used by tips.
 */
export async function recordWagerTxn(
  tx: Tx,
  opts: {
    senderId?: string | null;
    recipientId: string;
    amount: number;
    entityType: 'wager' | 'tournament';
    entityId: string;
    note?: string;
  },
): Promise<void> {
  if (!Number.isInteger(opts.amount) || opts.amount <= 0) return;
  await tx.coinTransaction.create({
    data: {
      senderId: opts.senderId ?? null,
      recipientId: opts.recipientId,
      amount: opts.amount,
      type: 'WAGER',
      note: opts.note?.slice(0, 280) ?? null,
      entityType: opts.entityType,
      entityId: opts.entityId.slice(0, 64),
    },
  });
}
