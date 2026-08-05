/**
 * Group gifting and pooled purchases (F20) — the escrow lifecycle.
 *
 * ── The accounting model ────────────────────────────────────────────────────
 *
 * A contribution is a **SINK** (`debitCoins`): the coins leave the contributor
 * and leave circulation. Settlement and refund are **FAUCETS**
 * (`creditCoins`): they put coins back. This mirrors `lib/wager/escrow` and it
 * is deliberately not a transfer — while escrowed, the coins belong to nobody,
 * and the supply report should show them as out of circulation rather than
 * parked in some holding account that has to be reconciled separately.
 *
 * The invariant that matters: for any pool, exactly one of these is true —
 * still escrowed (`settledAt` and `refundedAt` both null), paid out to the
 * beneficiary, or returned to the contributors. Never two, never neither.
 *
 * ── How settle and refund stay mutually exclusive ───────────────────────────
 *
 * Not with a lock, but with disjoint predicates. Settlement can only claim a
 * pool whose `expiresAt` is still in the FUTURE; the refund sweep only selects
 * pools whose `expiresAt` is in the PAST. The two can therefore never contend
 * for the same row, and the boundary is decided by the database's own clock
 * comparison inside the same UPDATE that claims the pool.
 *
 * ── Why the refund sweep is written the way it is ───────────────────────────
 *
 * It refunds one contribution per transaction, claiming each with a conditional
 * `updateMany ... WHERE refundedAt IS NULL` before crediting, and only marks the
 * POOL refunded once no unrefunded contributions remain. That ordering is the
 * resumability story: a crash halfway through leaves the paid contributions
 * marked and the pool unmarked, so the next run finishes the job and pays
 * nobody twice. Marking the pool first would be faster and would lose money.
 *
 * Two independent guards stop a double payment: the conditional claim (which
 * loses the race by matching zero rows) and the ledger idempotency key
 * `pool-refund:<contributionId>` (which is unique per contribution forever).
 * Either alone would be sufficient; both are cheap.
 */
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma.server';
import { creditCoins, debitCoins, InsufficientFundsError } from '@/lib/economy/ledger.server';
import { resolveUser, userDisplaySelect } from '@/lib/user-display';
import {
  POOL_MAX_OPEN_PER_USER,
  createPoolSchema,
  poolState,
  type CreatePoolInput,
  type PoolPurpose,
  type PoolView,
} from '@/lib/commerce/pools';

export class PoolError extends Error {
  constructor(
    message:
      | 'NOT_FOUND'
      | 'CLOSED'
      | 'EXPIRED'
      | 'INSUFFICIENT_COINS'
      | 'INVALID_TARGET'
      | 'SELF_TARGET'
      | 'TOO_MANY_OPEN'
      | 'INVALID_INPUT',
  ) {
    super(message);
    this.name = 'PoolError';
  }
}

/** Ledger dedupe tokens. Stable for the lifetime of the row they name. */
export const poolRefundRefId = (contributionId: bigint | string) => `pool-refund:${contributionId}`;
export const poolSettleRefId = (poolId: string) => `pool-settle:${poolId}`;
export const poolContributeRefId = (contributionId: bigint | string) =>
  `pool-contribute:${contributionId}`;

// ── refund (written first, on purpose) ───────────────────────────────────────

export interface RefundSweepResult {
  /** Pools fully swept and marked refunded in this run. */
  poolsRefunded: number;
  /** Individual contributions returned in this run. */
  contributionsRefunded: number;
  /** Total coins returned to contributors. */
  coinsReturned: number;
  /** Contributions that were already refunded by a concurrent/previous run. */
  skipped: number;
  /** Pools that errored; the sweep continues past them and retries next run. */
  failed: number;
}

/** How many contributions one sweep run will process per pool before yielding. */
const REFUND_BATCH = 200;

/**
 * Return every contribution to every pool that expired without meeting its
 * goal. Idempotent and resumable: safe to run concurrently with itself, safe to
 * re-run after a crash, and it never pays the same contribution twice.
 *
 * Intended to be driven by a cron in the worker tier (the web tier has no
 * scheduler) — see the deployment note in the module this is reported from.
 */
export async function refundExpiredPools(
  opts: { now?: Date; maxPools?: number } = {},
): Promise<RefundSweepResult> {
  const now = opts.now ?? new Date();
  const result: RefundSweepResult = {
    poolsRefunded: 0,
    contributionsRefunded: 0,
    coinsReturned: 0,
    skipped: 0,
    failed: 0,
  };

  const due = await prisma.pool.findMany({
    where: { expiresAt: { lte: now }, settledAt: null, refundedAt: null },
    select: { id: true },
    orderBy: { expiresAt: 'asc' },
    take: opts.maxPools ?? 50,
  });

  for (const { id } of due) {
    try {
      const one = await refundPool(id, now);
      result.contributionsRefunded += one.contributionsRefunded;
      result.coinsReturned += one.coinsReturned;
      result.skipped += one.skipped;
      if (one.poolMarked) result.poolsRefunded += 1;
    } catch (err) {
      // One bad pool must not abort the sweep — the rest of the queue is other
      // people's money. It stays unmarked and is retried on the next run.
      result.failed += 1;
      console.error('[pools] refund sweep failed for pool', id, err);
    }
  }

  return result;
}

interface SinglePoolRefund {
  contributionsRefunded: number;
  coinsReturned: number;
  skipped: number;
  poolMarked: boolean;
}

/**
 * Refund one pool's outstanding contributions. Exported for the API's manual
 * "cancel my pool" path and for tests; the sweep is the normal driver.
 */
export async function refundPool(poolId: string, now: Date = new Date()): Promise<SinglePoolRefund> {
  const out: SinglePoolRefund = {
    contributionsRefunded: 0,
    coinsReturned: 0,
    skipped: 0,
    poolMarked: false,
  };

  // Page through unrefunded contributions. The filter is the resume point: a
  // contribution already paid is invisible to the next pass.
  for (;;) {
    const batch = await prisma.poolContribution.findMany({
      where: { poolId, refundedAt: null },
      select: { id: true, userId: true, coins: true },
      orderBy: { id: 'asc' },
      take: REFUND_BATCH,
    });
    if (batch.length === 0) break;

    for (const c of batch) {
      const refunded = await refundContribution(c, poolId, now);
      if (refunded) {
        out.contributionsRefunded += 1;
        out.coinsReturned += c.coins;
      } else {
        out.skipped += 1;
      }
    }

    if (batch.length < REFUND_BATCH) break;
  }

  // Only now — with nothing left owing — is it safe to call the pool refunded.
  // Conditional so a concurrent sweep marking the same pool is a no-op rather
  // than an overwrite of someone else's timestamp.
  const remaining = await prisma.poolContribution.count({ where: { poolId, refundedAt: null } });
  if (remaining === 0) {
    const marked = await prisma.pool.updateMany({
      where: { id: poolId, settledAt: null, refundedAt: null },
      data: { refundedAt: now, raised: 0 },
    });
    out.poolMarked = marked.count > 0;
  }

  return out;
}

/**
 * Return one contribution. Returns false when another run already claimed it —
 * which is a normal outcome under concurrency, not an error.
 */
async function refundContribution(
  c: { id: bigint; userId: string; coins: number },
  poolId: string,
  now: Date,
): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    // The claim. Conditional on `refundedAt IS NULL`, so exactly one runner can
    // ever move this row out of the unrefunded set, and it happens in the same
    // transaction as the credit — if the credit throws, the claim unwinds and
    // the contribution is retried rather than silently marked as paid.
    const claim = await tx.poolContribution.updateMany({
      where: { id: c.id, refundedAt: null },
      data: { refundedAt: now },
    });
    if (claim.count === 0) return false;

    await creditCoins(c.userId, c.coins, {
      tx,
      type: 'GIFT',
      note: 'Pool refund — goal not met',
      entityType: 'pool',
      entityId: poolId,
      // Belt and braces: unique per contribution for all time, so even a
      // resurrected row or a re-run against a restored backup cannot double-pay.
      idempotencyKey: poolRefundRefId(c.id),
    });

    return true;
  });
}

// ── create / contribute / settle ─────────────────────────────────────────────

/**
 * Every pool pays out to exactly one user. For `membership-gift` and
 * `creator-tip` that is the obvious recipient; for `tournament-prize` it is the
 * organiser who awards the pot. Requiring a real user for all three is what
 * keeps the escrow closed — there is no purpose whose settlement has nowhere to
 * send the coins, which is the shape that leaks money.
 */
async function resolveBeneficiary(
  purpose: PoolPurpose,
  targetId: string | undefined,
  creatorId: string,
): Promise<string> {
  if (!targetId) throw new PoolError('INVALID_TARGET');
  if (targetId === creatorId && purpose !== 'tournament-prize') throw new PoolError('SELF_TARGET');
  const user = await prisma.user.findUnique({ where: { id: targetId }, select: { id: true } });
  if (!user) throw new PoolError('INVALID_TARGET');
  return user.id;
}

export async function createPool(creatorId: string, input: CreatePoolInput): Promise<string> {
  const parsed = createPoolSchema.safeParse(input);
  if (!parsed.success) throw new PoolError('INVALID_INPUT');
  const { purpose, targetId, goalCoins, durationHours } = parsed.data;

  const beneficiary = await resolveBeneficiary(purpose, targetId, creatorId);

  const open = await prisma.pool.count({
    where: { creatorId, settledAt: null, refundedAt: null, expiresAt: { gt: new Date() } },
  });
  if (open >= POOL_MAX_OPEN_PER_USER) throw new PoolError('TOO_MANY_OPEN');

  const pool = await prisma.pool.create({
    data: {
      creatorId,
      purpose,
      targetId: beneficiary,
      goalCoins,
      expiresAt: new Date(Date.now() + durationHours * 3_600_000),
    },
    select: { id: true },
  });
  return pool.id;
}

export interface ContributeResult {
  raised: number;
  goalCoins: number;
  settled: boolean;
  balance: number;
}

/**
 * Escrow `coins` from `userId` into the pool, settling it if that meets the
 * goal. The debit and the `PoolContribution` row commit together — an escrowed
 * coin the pool does not know about is a coin nobody can refund.
 */
export async function contribute(
  poolId: string,
  userId: string,
  coins: number,
): Promise<ContributeResult> {
  if (!Number.isInteger(coins) || coins <= 0) throw new PoolError('INVALID_INPUT');

  try {
    return await prisma.$transaction(async (tx) => {
      const pool = await tx.pool.findUnique({
        where: { id: poolId },
        select: {
          id: true,
          purpose: true,
          targetId: true,
          goalCoins: true,
          raised: true,
          expiresAt: true,
          settledAt: true,
          refundedAt: true,
        },
      });
      if (!pool) throw new PoolError('NOT_FOUND');
      if (pool.settledAt || pool.refundedAt) throw new PoolError('CLOSED');
      if (pool.expiresAt.getTime() <= Date.now()) throw new PoolError('EXPIRED');

      // Row first: it carries the id the ledger key is built from, so the
      // escrowed coins are always attributable to a refundable contribution.
      const row = await tx.poolContribution.create({
        data: { poolId, userId, coins },
        select: { id: true },
      });

      await debitCoins(userId, coins, {
        tx,
        type: 'GIFT',
        note: 'Pool contribution',
        entityType: 'pool',
        entityId: poolId,
        idempotencyKey: poolContributeRefId(row.id),
      });

      const updated = await tx.pool.update({
        where: { id: poolId },
        data: { raised: { increment: coins } },
        select: { raised: true, goalCoins: true },
      });

      let settled = false;
      if (updated.raised >= updated.goalCoins) {
        settled = await settlePool(tx, {
          id: pool.id,
          purpose: pool.purpose as PoolPurpose,
          targetId: pool.targetId,
          raised: updated.raised,
        });
      }

      const profile = await tx.userProfile.findUnique({
        where: { userId },
        select: { coins: true },
      });

      return {
        raised: updated.raised,
        goalCoins: updated.goalCoins,
        settled,
        balance: profile?.coins ?? 0,
      };
    });
  } catch (err) {
    if (err instanceof InsufficientFundsError) throw new PoolError('INSUFFICIENT_COINS');
    throw err;
  }
}

/**
 * Pay the escrowed pot to the beneficiary and close the pool.
 *
 * The claim carries `expiresAt: { gt: now }`, which is what makes settlement and
 * the refund sweep mutually exclusive without a lock: the sweep only ever looks
 * at pools that are already past their deadline, so the two predicates select
 * disjoint rows. `count === 0` means the pool was closed under us — by another
 * contributor's settle, or by the sweep — and we must not pay.
 */
async function settlePool(
  tx: Prisma.TransactionClient,
  pool: { id: string; purpose: PoolPurpose; targetId: string | null; raised: number },
): Promise<boolean> {
  if (!pool.targetId) return false;

  const claim = await tx.pool.updateMany({
    where: { id: pool.id, settledAt: null, refundedAt: null, expiresAt: { gt: new Date() } },
    data: { settledAt: new Date() },
  });
  if (claim.count === 0) return false;

  await creditCoins(pool.targetId, pool.raised, {
    tx,
    type: 'GIFT',
    note: `Pool settled — ${pool.purpose}`,
    entityType: 'pool',
    entityId: pool.id,
    idempotencyKey: poolSettleRefId(pool.id),
  });

  return true;
}

// ── reads ────────────────────────────────────────────────────────────────────

export async function getPool(poolId: string, viewerId: string | null): Promise<PoolView | null> {
  const pool = await prisma.pool.findUnique({
    where: { id: poolId },
    select: {
      id: true,
      creatorId: true,
      purpose: true,
      targetId: true,
      goalCoins: true,
      raised: true,
      expiresAt: true,
      settledAt: true,
      refundedAt: true,
      contributions: {
        select: {
          userId: true,
          coins: true,
          refundedAt: true,
          user: { select: userDisplaySelect },
        },
        orderBy: { createdAt: 'desc' },
        take: 100,
      },
    },
  });
  if (!pool) return null;

  const contributors = pool.contributions.map((c) => {
    const u = resolveUser(c.user);
    return {
      userId: c.userId,
      name: u.name,
      handle: u.handle,
      coins: c.coins,
      refunded: c.refundedAt !== null,
    };
  });

  return {
    id: pool.id,
    creatorId: pool.creatorId,
    purpose: pool.purpose as PoolPurpose,
    targetId: pool.targetId,
    goalCoins: pool.goalCoins,
    raised: pool.raised,
    expiresAt: pool.expiresAt.toISOString(),
    state: poolState(pool),
    contributors,
    myContribution: viewerId
      ? pool.contributions
          .filter((c) => c.userId === viewerId && c.refundedAt === null)
          .reduce((sum, c) => sum + c.coins, 0)
      : 0,
  };
}

/** Open pools, newest deadline first — the browse surface. */
export async function listOpenPools(limit = 30): Promise<PoolView[]> {
  const rows = await prisma.pool.findMany({
    where: { settledAt: null, refundedAt: null, expiresAt: { gt: new Date() } },
    select: { id: true },
    orderBy: { expiresAt: 'asc' },
    take: limit,
  });
  const views = await Promise.all(rows.map((r) => getPool(r.id, null)));
  return views.filter((v): v is PoolView => v !== null);
}
