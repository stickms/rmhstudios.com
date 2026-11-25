import type { Prisma } from '@prisma/client';
import type { EscrowLedger } from '@/lib/economy/escrow-core';
import { assertPlayAllowedOn } from '@/lib/economy/play-limits-core';

// Shared coin-escrow primitives for wager matches and tournaments. Both features
// move coins the same way, so the atomicity contract lives here once.
//
// The hold / settle / refund lifecycle itself is the shared escrow primitive in
// `lib/economy/escrow-core.ts`; `wagerEscrow` at the bottom of this file is the
// ledger it runs on for wagers (a balance write plus its WAGER row, as below).
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

/**
 * Take a STAKE: a wager hold or a tournament entry fee. These escrow through the raw
 * {@link debitCoins} above rather than the ledger's `debitCoinsOn`, so the ledger's
 * responsible-play check (W8) never saw them; this runs it here, inside the same
 * transaction, before the balance moves. A self-excluded member, one in a cool-off or one
 * past their daily cap is refused with the shared `AppError` codes (`SELF_EXCLUDED`,
 * `COOL_OFF_ACTIVE`, `STAKE_LIMIT_REACHED`), exactly as at a casino table.
 */
export async function debitStake(tx: Tx, userId: string, amount: number): Promise<void> {
  await assertPlayAllowedOn(tx, userId, amount);
  await debitCoins(tx, userId, amount);
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
 * Write a WAGER ledger row so every escrow movement is auditable, using the
 * ledger's three-shape convention (see `CoinTransaction` in the schema):
 *
 *   - **Hold** (stake/entry fee into escrow): `senderId` = user,
 *     `recipientId` = null. Coins left the user's balance for the pot.
 *   - **Payout / refund** (pot → user): `senderId` = null, `recipientId` = user.
 *   - **Transfer**: both set.
 *
 * Holds used to be written as a SELF-transfer (`senderId` and `recipientId` both
 * the staking user), which nets to zero in any sum over the ledger even though
 * the balance really did go down — so escrow silently broke reconciliation for
 * every wager and tournament. `recipientId` is nullable here for that reason.
 */
export async function recordWagerTxn(
  tx: Tx,
  opts: {
    senderId?: string | null;
    recipientId: string | null;
    amount: number;
    entityType: 'wager' | 'tournament';
    entityId: string;
    note?: string;
    /**
     * Deterministic dedupe token for a payout/refund (e.g. `wager:<id>:payout`).
     * The ledger's unique index makes a second credit for the same movement
     * fail, which aborts the surrounding transaction — so the balance credit
     * written next to it rolls back too. Defense-in-depth behind the status
     * compare-and-swap every caller does first.
     */
    idempotencyKey?: string;
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
      idempotencyKey: opts.idempotencyKey?.slice(0, 128) ?? null,
    },
  });
}

/** How a wager or tournament escrow movement is booked by {@link recordWagerTxn}. */
export interface WagerMovement {
  entityType: 'wager' | 'tournament';
  entityId: string;
  note?: string;
  idempotencyKey?: string;
}

/**
 * The wager tier's ledger for `lib/economy/escrow-core.ts`: the helpers above,
 * each paired with its WAGER row. A hold is `debitCoins` then a SINK row
 * (`senderId` = user); a payout or refund is `creditCoins` then a FAUCET row
 * (`recipientId` = user). A repeated payout key fails the row's unique index
 * and aborts the caller's transaction, crediting nothing.
 */
export const wagerEscrow: EscrowLedger<Tx, WagerMovement> = {
  debit: async (tx, userId, amount, movement) => {
    await debitStake(tx, userId, amount);
    await recordWagerTxn(tx, {
      senderId: userId,
      recipientId: null,
      amount,
      ...movement,
    });
  },
  credit: async (tx, userId, amount, movement) => {
    await creditCoins(tx, userId, amount);
    await recordWagerTxn(tx, {
      recipientId: userId,
      amount,
      ...movement,
    });
  },
};
