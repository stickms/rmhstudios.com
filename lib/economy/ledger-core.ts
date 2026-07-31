/**
 * The coin ledger's movement logic, with no Prisma client of its own.
 *
 * Split out from `ledger.server.ts` for one reason: the realtime tier
 * (`server/socket-server`, where the casino tables live) already owns a Prisma
 * client, and importing the web tier's singleton there would open a second
 * connection pool inside the hottest process in the system. Every function here
 * takes the client to use, so the socket server passes its own and the web tier
 * passes the singleton.
 *
 * Callers should import `ledger.server.ts` unless they already hold a client.
 *
 * ── Why this module exists at all ──────────────────────────────────────────
 *
 * Before it, ~50 call sites hand-rolled their own balance arithmetic. Most were
 * correct; the ones that were not did not look wrong:
 *
 *  1. **Read-then-write is a double-spend.** Under Postgres READ COMMITTED,
 *     `SELECT coins` → `if (coins >= price)` → `UPDATE ... decrement` lets two
 *     concurrent requests both read 100, both pass the check, and both
 *     decrement. Every casino handler, the streak-freeze purchase and the
 *     build-unlock route did exactly this. The fix is to make the check part of
 *     the write — a conditional UPDATE carrying `coins >= amount` in its WHERE
 *     clause — so the database decides who wins and the loser matches 0 rows.
 *  2. **A retry is a second payment.** `idempotencyKey` makes a repeat a no-op.
 *  3. **Sinks were invisible.** Spending wrote no ledger row, so the ledger
 *     could not be summed against the balances it was meant to explain.
 */

import type { CoinTxnType, Prisma, PrismaClient } from '@prisma/client';

/** Any Prisma client: the base client or an interactive-transaction client. */
export type Db = Prisma.TransactionClient | PrismaClient;

/** A client that can open transactions (i.e. not already inside one). */
export interface TxCapable {
  $transaction<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T>;
}

/**
 * Largest single movement we will process. Not a product rule — a blast-radius
 * limit. A bug or a compromised endpoint that tries to move a billion coins
 * should fail loudly rather than quietly mint an economy's worth of currency.
 */
export const MAX_TRANSACTION = 10_000_000;

/** Balance a new profile is seeded with (matches the historical default). */
export const STARTING_BALANCE = 10;

/** Raised when a debit would overdraw. Callers map it to a 4xx. */
export class InsufficientFundsError extends Error {
  readonly code = 'INSUFFICIENT_FUNDS';
  constructor(
    readonly userId: string,
    readonly required: number,
  ) {
    // Message kept as the legacy sentinel so existing `catch` blocks that
    // string-match 'INSUFFICIENT_COINS' keep working.
    super('INSUFFICIENT_COINS');
    this.name = 'InsufficientFundsError';
  }
}

/**
 * Raised when a guarded credit (`onlyIfBalanceBelow`) doesn't apply because the
 * user is already above the threshold. Not really an error — it is the normal
 * "you don't need a top-up" outcome — but it has to unwind the transaction, so
 * it travels as one. `creditCoinsOn` converts it back into a plain
 * `applied: false` result before returning.
 */
export class NotEligibleError extends Error {
  readonly code = 'NOT_ELIGIBLE';
  constructor(readonly userId: string) {
    super('NOT_ELIGIBLE');
    this.name = 'NotEligibleError';
  }
}

/** Raised when an amount is not a positive, in-range integer. */
export class InvalidAmountError extends Error {
  readonly code = 'INVALID_AMOUNT';
  constructor(readonly amount: number) {
    super(`Invalid coin amount: ${amount}`);
    this.name = 'InvalidAmountError';
  }
}

export interface LedgerOptions {
  /** Ledger classification. Defaults to REWARD for credits, PURCHASE for debits. */
  type?: CoinTxnType;
  /** Short human-readable reason, shown in the wallet ledger. */
  note?: string;
  entityType?: string;
  entityId?: string;
  /**
   * Dedupe token. Reusing one makes the call a no-op that reports `replayed`.
   * Build it from something stable and request-specific.
   */
  idempotencyKey?: string;
  /** Join an existing transaction instead of opening one. */
  tx?: Db;
  /**
   * Credit only if the balance is currently below this. For "top up if broke"
   * faucets (the /api/coins/claim safety net), where granting to someone who is
   * already flush would be a free money printer.
   *
   * The comparison happens inside the UPDATE's WHERE clause, so two concurrent
   * claims cannot both observe the same sub-threshold balance and each grant.
   * When the condition fails the call reports `applied: false` rather than
   * throwing — not being eligible is a normal outcome, not an error.
   *
   * Credits only; ignored by debit and transfer.
   */
  onlyIfBalanceBelow?: number;
}

export interface LedgerResult {
  /** True when coins actually moved. */
  applied: boolean;
  /** True when this call was recognised as a replay of an earlier one. */
  replayed: boolean;
  /** Ledger row id (the original row's id on a replay). */
  transactionId: string | null;
}

/** Postgres unique-violation surfaced by Prisma. */
function isUniqueViolation(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: string }).code === 'P2002';
}

function assertAmount(amount: number): void {
  if (!Number.isInteger(amount) || amount <= 0 || amount > MAX_TRANSACTION) {
    throw new InvalidAmountError(amount);
  }
}

/**
 * Ensure a profile row exists so a conditional update has something to match.
 * Upsert-then-update rather than a single upsert, because the balance guard has
 * to live in a WHERE clause and an upsert's `create` branch has none.
 */
async function ensureProfile(db: Db, userId: string): Promise<void> {
  await db.userProfile.upsert({
    where: { userId },
    create: { userId, coins: STARTING_BALANCE },
    update: {},
    select: { userId: true },
  });
}

/**
 * Shared execution shell: idempotency, transaction ownership, replay
 * resolution. `move` performs the balance change and writes the ledger rows,
 * returning the primary row's id.
 *
 * The transaction-ownership distinction matters and is easy to get wrong. When
 * we opened the transaction, a unique-key collision aborts it, so the balance
 * change is rolled back and it is safe to report a replay. When the CALLER owns
 * the transaction we must rethrow: our balance change is part of their unit of
 * work, and swallowing the error would leave it applied — turning a duplicate
 * request into exactly the double-spend the key exists to prevent.
 */
async function execute(
  client: Db & Partial<TxCapable>,
  opts: LedgerOptions,
  move: (db: Db) => Promise<string>,
): Promise<LedgerResult> {
  const key = opts.idempotencyKey;
  const ownsTx = !opts.tx;

  const body = async (db: Db): Promise<LedgerResult> => {
    if (key) {
      const existing = await db.coinTransaction.findUnique({
        where: { idempotencyKey: key },
        select: { id: true },
      });
      if (existing) return { applied: false, replayed: true, transactionId: existing.id };
    }
    const id = await move(db);
    return { applied: true, replayed: false, transactionId: id };
  };

  try {
    if (opts.tx) return await body(opts.tx);
    if (typeof client.$transaction !== 'function') {
      throw new TypeError('ledger: client cannot open a transaction; pass opts.tx');
    }
    return await client.$transaction((tx) => body(tx));
  } catch (err) {
    // Lost a race on the same key between the check above and the insert.
    if (key && ownsTx && isUniqueViolation(err)) {
      const existing = await client.coinTransaction.findUnique({
        where: { idempotencyKey: key },
        select: { id: true },
      });
      return { applied: false, replayed: true, transactionId: existing?.id ?? null };
    }
    throw err;
  }
}

/**
 * FAUCET — create `amount` coins and credit them to `userId`.
 *
 * Use for quest/streak/achievement rewards, refunds, payouts from a pot, and
 * admin grants. Every call increases total supply, which is why the supply
 * report counts these separately from transfers.
 */
export async function creditCoinsOn(
  client: Db & Partial<TxCapable>,
  userId: string,
  amount: number,
  opts: LedgerOptions = {},
): Promise<LedgerResult> {
  assertAmount(amount);

  return creditInner(client, userId, amount, opts).catch((err) => {
    // A failed eligibility guard is an outcome, not a failure. It had to throw
    // to roll the transaction back; convert it to a normal result here. When
    // the CALLER owns the transaction it must keep propagating, for the same
    // reason replays do: their unit of work has to unwind too.
    if (err instanceof NotEligibleError && !opts.tx) {
      return { applied: false, replayed: false, transactionId: null };
    }
    throw err;
  });
}

function creditInner(
  client: Db & Partial<TxCapable>,
  userId: string,
  amount: number,
  opts: LedgerOptions,
): Promise<LedgerResult> {
  return execute(client, opts, async (db) => {
    if (opts.onlyIfBalanceBelow !== undefined) {
      // Guarded top-up: the threshold rides in the WHERE clause so the check
      // and the grant are one atomic step.
      await ensureProfile(db, userId);
      const granted = await db.userProfile.updateMany({
        where: { userId, coins: { lt: opts.onlyIfBalanceBelow } },
        data: { coins: { increment: amount } },
      });
      if (granted.count === 0) throw new NotEligibleError(userId);
    } else {
      await db.userProfile.upsert({
        where: { userId },
        create: { userId, coins: STARTING_BALANCE + amount },
        update: { coins: { increment: amount } },
        select: { userId: true },
      });
    }
    const row = await db.coinTransaction.create({
      data: {
        senderId: null,
        recipientId: userId,
        amount,
        type: opts.type ?? 'REWARD',
        note: opts.note?.slice(0, 280) ?? null,
        entityType: opts.entityType ?? null,
        entityId: opts.entityId ?? null,
        idempotencyKey: opts.idempotencyKey ?? null,
      },
      select: { id: true },
    });
    return row.id;
  });
}

/**
 * SINK — destroy `amount` coins held by `userId`.
 *
 * Use where coins leave circulation entirely: shop purchases, cosmetic
 * unlocks, market fees, casino stakes, entry costs with no counterparty.
 * Throws `InsufficientFundsError` when the balance can't cover it — the check
 * IS the conditional update below, not a prior read, so concurrent debits
 * cannot both succeed against the same coins.
 */
export async function debitCoinsOn(
  client: Db & Partial<TxCapable>,
  userId: string,
  amount: number,
  opts: LedgerOptions = {},
): Promise<LedgerResult> {
  assertAmount(amount);

  return execute(client, opts, async (db) => {
    await ensureProfile(db, userId);

    const debit = await db.userProfile.updateMany({
      where: { userId, coins: { gte: amount } },
      data: { coins: { decrement: amount } },
    });
    if (debit.count === 0) throw new InsufficientFundsError(userId, amount);

    const row = await db.coinTransaction.create({
      data: {
        senderId: userId,
        recipientId: null,
        amount,
        type: opts.type ?? 'PURCHASE',
        note: opts.note?.slice(0, 280) ?? null,
        entityType: opts.entityType ?? null,
        entityId: opts.entityId ?? null,
        idempotencyKey: opts.idempotencyKey ?? null,
      },
      select: { id: true },
    });
    return row.id;
  });
}

/**
 * TRANSFER — move `amount` coins from one user to another. Supply is conserved.
 *
 * Debit and credit happen in the same transaction, so the two halves cannot
 * come apart: there is no window in which the sender has paid and the recipient
 * has not been paid.
 *
 * `fee`, when set, is destroyed rather than delivered — the recipient receives
 * `amount - fee`. A fee is the cleanest coin sink available, because it removes
 * currency from activity that is already happening.
 */
export async function transferCoinsOn(
  client: Db & Partial<TxCapable>,
  fromUserId: string,
  toUserId: string,
  amount: number,
  opts: LedgerOptions & { fee?: number } = {},
): Promise<LedgerResult> {
  assertAmount(amount);
  if (fromUserId === toUserId) throw new InvalidAmountError(amount);

  const fee = opts.fee ?? 0;
  if (!Number.isInteger(fee) || fee < 0 || fee >= amount) {
    throw new InvalidAmountError(fee);
  }
  const delivered = amount - fee;

  return execute(client, opts, async (db) => {
    await ensureProfile(db, fromUserId);
    await ensureProfile(db, toUserId);

    const debit = await db.userProfile.updateMany({
      where: { userId: fromUserId, coins: { gte: amount } },
      data: { coins: { decrement: amount } },
    });
    if (debit.count === 0) throw new InsufficientFundsError(fromUserId, amount);

    await db.userProfile.update({
      where: { userId: toUserId },
      data: { coins: { increment: delivered } },
      select: { userId: true },
    });

    const row = await db.coinTransaction.create({
      data: {
        senderId: fromUserId,
        recipientId: toUserId,
        amount: delivered,
        type: opts.type ?? 'TIP',
        note: opts.note?.slice(0, 280) ?? null,
        entityType: opts.entityType ?? null,
        entityId: opts.entityId ?? null,
        idempotencyKey: opts.idempotencyKey ?? null,
      },
      select: { id: true },
    });

    // The fee is a separate sink row so the reconciliation identity holds for
    // the sender: they parted with `amount`, the recipient received
    // `delivered`, and the difference is accounted for rather than lost.
    if (fee > 0) {
      await db.coinTransaction.create({
        data: {
          senderId: fromUserId,
          recipientId: null,
          amount: fee,
          type: opts.type ?? 'TIP',
          note: 'Transaction fee',
          entityType: opts.entityType ?? null,
          entityId: opts.entityId ?? null,
        },
        select: { id: true },
      });
    }

    return row.id;
  });
}

/** Current balance, or 0 for a user with no profile row yet. */
export async function getBalanceOn(db: Db, userId: string): Promise<number> {
  const profile = await db.userProfile.findUnique({
    where: { userId },
    select: { coins: true },
  });
  return profile?.coins ?? 0;
}
