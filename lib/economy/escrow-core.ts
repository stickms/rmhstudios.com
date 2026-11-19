/**
 * Coin escrow — hold, settle, refund — with no Prisma client and no ledger of
 * its own.
 *
 * Four features hold a member's coins against an outcome and later pay them to
 * someone or give them back: head-to-head wagers (`lib/wager`), pools
 * (`lib/commerce/pools.server.ts`), community goals
 * (`lib/economy/community-goal.server.ts`) and the casino tables
 * (`features/casino/server`). Each wrote the same three steps by hand. This
 * module is those steps once, so the ordering that keeps them safe is written
 * down in one place.
 *
 * ── The accounting model ────────────────────────────────────────────────────
 *
 * A hold is a **SINK**: the coins leave the member and leave circulation. A
 * settlement or a refund is a **FAUCET**: it puts coins back. It is
 * deliberately not a transfer: while escrowed the coins belong to nobody, and
 * the supply report shows them out of circulation instead of parked in a
 * holding account that would need reconciling on its own.
 *
 * ── The one ordering rule ───────────────────────────────────────────────────
 *
 * **Claim, then credit, in one transaction.** Every payout out of escrow first
 * moves a row out of the payable state with a conditional `updateMany` (the
 * claim), and credits only when that matched a row. Under READ COMMITTED the
 * losing runner of a race matches zero rows and pays nothing; and because the
 * claim and the credit commit together, a credit that throws unwinds its claim
 * and the payout is retried rather than recorded as paid. Crediting first and
 * claiming second is the shape that pays twice.
 *
 * Behind the claim sits the ledger idempotency key each movement carries,
 * unique forever. Either guard alone would stop a double payment; both are
 * cheap.
 *
 * ── Why the ledger and the client are parameters ────────────────────────────
 *
 * Same reason as `ledger-core.ts`: the casino tables run in the socket hub,
 * which owns its own Prisma client, and importing the web tier's singleton
 * there would open a second pool inside the hottest process. So nothing here
 * imports a client or a `.server` module. The caller passes the transaction
 * (or a client that can open one) and an {@link EscrowLedger} that performs
 * the actual balance movement:
 *
 *   - `lib/economy/escrow.server.ts` binds the web tier's ledger
 *     (`ledger.server.ts`) — pools and community goals;
 *   - `lib/wager/escrow.server.ts` binds the wager helpers, which book the
 *     balance change and its `WAGER` row as two writes;
 *   - the hub reads what became of its stakes through {@link readSettledKeys}
 *     with its own client.
 *
 * The module adds no validation, no queries and no writes of its own beyond
 * what the ledger and the caller's callbacks do, so moving a feature onto it
 * changes no row and no key.
 */

import type { Db } from './ledger-core';

/** A client that can open an interactive transaction handing out `Tx`. */
export interface EscrowTxRunner<Tx> {
  $transaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T>;
}

/**
 * The balance movement under an escrow. `M` is whatever the binding needs to
 * book the ledger row (type, note, entity, idempotency key).
 *
 * `debit` must throw when the balance cannot cover the hold, inside the
 * conditional update; `credit` must be idempotent on the key `M` carries.
 */
export interface EscrowLedger<Tx, M> {
  debit(tx: Tx, userId: string, amount: number, movement: M): Promise<unknown>;
  credit(tx: Tx, userId: string, amount: number, movement: M): Promise<unknown>;
}

/** One payout out of escrow. */
export interface EscrowCredit<M> {
  userId: string;
  amount: number;
  movement: M;
}

// ── hold ─────────────────────────────────────────────────────────────────────

/**
 * Take `amount` coins from `userId` into escrow (a SINK). Must run inside the
 * transaction that also writes the row the hold belongs to (the contribution,
 * the pledge, the match), so an escrowed coin is always attributable to
 * something that can refund it.
 */
export async function holdEscrow<Tx, M>(
  tx: Tx,
  ledger: EscrowLedger<Tx, M>,
  hold: EscrowCredit<M>,
): Promise<void> {
  await ledger.debit(tx, hold.userId, hold.amount, hold.movement);
}

// ── settle ───────────────────────────────────────────────────────────────────

/**
 * Close an escrow and pay it out: run `claim` (the conditional transition out
 * of the payable state), and only if it returned true, credit each payout in
 * order. Returns whether the claim won.
 *
 * Used for a settlement to a winner or beneficiary, and for a whole-escrow
 * refund that one claim closes (a wager voided with both stakes in it).
 * `credits` may be a function so a caller can build the list from what the
 * claim observed.
 */
export async function settleEscrow<Tx, M>(
  tx: Tx,
  ledger: EscrowLedger<Tx, M>,
  settlement: {
    claim: () => Promise<boolean>;
    credits: readonly EscrowCredit<M>[] | (() => readonly EscrowCredit<M>[]);
  },
): Promise<boolean> {
  if (!(await settlement.claim())) return false;
  const credits =
    typeof settlement.credits === 'function' ? settlement.credits() : settlement.credits;
  for (const c of credits) {
    await ledger.credit(tx, c.userId, c.amount, c.movement);
  }
  return true;
}

// ── refund, one holding at a time ────────────────────────────────────────────

/** One escrowed contribution: a pool contribution, a goal pledge. */
export interface EscrowHolding<Id> {
  id: Id;
  userId: string;
  coins: number;
}

export interface EscrowRefundPlan<Tx, M, Id> {
  /** Page size for {@link EscrowRefundPlan.outstanding}. */
  batchSize: number;
  /**
   * The next page of holdings not yet refunded, in a stable order. The filter
   * is the resume point: a holding already paid is invisible to the next call.
   */
  outstanding(take: number): Promise<EscrowHolding<Id>[]>;
  /**
   * The claim: a conditional update (`WHERE refundedAt IS NULL`) moving this
   * holding out of the unrefunded set. Returns whether it matched a row.
   */
  claim(tx: Tx, holding: EscrowHolding<Id>): Promise<boolean>;
  /** How the refund credit is booked (its key must be unique per holding). */
  movement(holding: EscrowHolding<Id>): M;
  /** How many holdings are still unrefunded. */
  remaining(): Promise<number>;
  /**
   * Mark the escrow itself refunded, conditionally. Called only once
   * `remaining()` is 0. Returns whether this call did the marking.
   */
  markRefunded(): Promise<boolean>;
  /**
   * Stop paging after a page in which every holding was already claimed
   * elsewhere. Community goals set it; pools never did.
   */
  stopWhenNoProgress?: boolean;
}

export interface EscrowRefundResult {
  /** Holdings refunded by this run. */
  refunded: number;
  /** Coins those refunds returned. */
  coinsReturned: number;
  /** Holdings a concurrent or earlier run had already claimed. */
  skipped: number;
  /** Whether this run marked the escrow refunded. */
  marked: boolean;
}

/**
 * Return every outstanding holding of one escrow, each in its own transaction
 * (claim, then credit), and mark the escrow refunded only once nothing is left
 * owing. Idempotent and resumable: a crash halfway leaves the paid holdings
 * marked and the escrow unmarked, so the next run finishes the job and pays
 * nobody twice. Marking the escrow first would be faster and would lose money.
 *
 * A credit that throws propagates (its own claim has unwound); holdings
 * refunded before it stay refunded.
 */
export async function refundEscrow<Tx, M, Id>(
  client: EscrowTxRunner<Tx>,
  ledger: EscrowLedger<Tx, M>,
  plan: EscrowRefundPlan<Tx, M, Id>,
): Promise<EscrowRefundResult> {
  const out: EscrowRefundResult = { refunded: 0, coinsReturned: 0, skipped: 0, marked: false };

  for (;;) {
    const batch = await plan.outstanding(plan.batchSize);
    if (batch.length === 0) break;

    let progressed = false;
    for (const holding of batch) {
      const paid = await refundHolding(client, ledger, plan, holding);
      if (paid) {
        out.refunded += 1;
        out.coinsReturned += holding.coins;
        progressed = true;
      } else {
        out.skipped += 1;
      }
    }

    if (batch.length < plan.batchSize) break;
    if (plan.stopWhenNoProgress && !progressed) break;
  }

  // Only now, with nothing left owing, is it safe to call the escrow refunded.
  if ((await plan.remaining()) === 0) {
    out.marked = await plan.markRefunded();
  }
  return out;
}

/**
 * Refund one holding. False when another run already claimed it, which is a
 * normal outcome under concurrency, not an error.
 */
function refundHolding<Tx, M, Id>(
  client: EscrowTxRunner<Tx>,
  ledger: EscrowLedger<Tx, M>,
  plan: EscrowRefundPlan<Tx, M, Id>,
  holding: EscrowHolding<Id>,
): Promise<boolean> {
  return client.$transaction(async (tx) => {
    if (!(await plan.claim(tx, holding))) return false;
    await ledger.credit(tx, holding.userId, holding.coins, plan.movement(holding));
    return true;
  });
}

// ── what became of a hold ────────────────────────────────────────────────────

/**
 * Which of `byKey`'s idempotency keys the ledger holds a row for, as the values
 * mapped to them, in the order the rows came back. One query; none at all
 * when `byKey` is empty. Throws if the ledger cannot be read.
 *
 * The casino hub asks this at restore ("was this stake paid, or returned?")
 * with its own client, so it takes any client.
 */
export async function readSettledKeys<T>(db: Db, byKey: ReadonlyMap<string, T>): Promise<T[]> {
  if (byKey.size === 0) return [];
  const rows = await db.coinTransaction.findMany({
    where: { idempotencyKey: { in: [...byKey.keys()] } },
    select: { idempotencyKey: true },
  });
  const hits: T[] = [];
  for (const row of rows) {
    const hit = byKey.get(row.idempotencyKey ?? '');
    if (hit !== undefined) hits.push(hit);
  }
  return hits;
}
