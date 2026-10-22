/**
 * Community goal pots — escrow lifecycle (C5).
 *
 * ── Accounting ──────────────────────────────────────────────────────────────
 *
 * Same model as `lib/commerce/pools.server.ts`, whose refund discipline this
 * module deliberately copies rather than reinvents: a pledge is a **SINK**
 * (`debitCoins`) and a refund is a **FAUCET** (`creditCoins`). While a goal is
 * open the pledged coins belong to nobody — they are out of circulation, and the
 * supply report shows them that way instead of parked in a holding account that
 * would need its own reconciliation. If the goal is funded the coins stay
 * burned (the community bought something); if not, the faucet puts each pledge
 * back exactly once.
 *
 * `Pool`/`PoolContribution` were considered and do not fit: a pool belongs to a
 * member, carries a beneficiary user, and its settlement pays that user. A
 * community goal is admin-run and settles to nobody — it "pays out" by an admin
 * shipping the unlock — so forcing it into `Pool` would mean a fake beneficiary.
 *
 * ── Exactly-once refunds ────────────────────────────────────────────────────
 *
 * Two independent guards, either sufficient on its own:
 *   1. a conditional claim — `updateMany ... WHERE refundedAt IS NULL` — in the
 *      SAME transaction as the credit, so if the credit throws the claim unwinds
 *      and the pledge is retried rather than silently marked paid; and
 *   2. the ledger idempotency key `cgoal-refund:<pledgeId>`, unique forever.
 * The goal is marked REFUNDED only when no unrefunded pledge remains, so a crash
 * mid-sweep leaves the goal in REFUNDING and the next run resumes it.
 *
 * ── Pledge vs. deadline ─────────────────────────────────────────────────────
 *
 * A pledge's increment is conditional on `status = OPEN AND deadline > now`; the
 * sweep claims `status = OPEN AND deadline <= now`. Both write the goal row, so
 * Postgres serialises them: if the pledge commits first the sweep waits and then
 * sees (and refunds) it; if the sweep claims first the pledge matches 0 rows and
 * rolls back, debit and all.
 */
import { prisma } from '@/lib/prisma.server';
import { apiCache } from '@/lib/cache';
import { creditCoins, debitCoins, InsufficientFundsError } from '@/lib/economy/ledger.server';
import { createNotification } from '@/lib/notifications.server';
import { logAdminAction } from '@/lib/admin-audit.server';
import type {
  CommunityGoalStatus,
  CommunityGoalView,
  CreateCommunityGoalInput,
} from '@/lib/economy/community-goal';

export type CommunityGoalErrorCode =
  | 'NOT_FOUND'
  | 'CLOSED'
  | 'EXCEEDS_REMAINING'
  | 'GOAL_CHANGED'
  | 'INSUFFICIENT_COINS'
  | 'BAD_DEADLINE'
  | 'BAD_STATE';

export class CommunityGoalError extends Error {
  constructor(
    readonly code: CommunityGoalErrorCode,
    readonly detail?: number,
  ) {
    super(code);
    this.name = 'CommunityGoalError';
  }
}

export const cgoalPledgeRefId = (pledgeId: bigint | string) => `cgoal-pledge:${pledgeId}`;
export const cgoalRefundRefId = (pledgeId: bigint | string) => `cgoal-refund:${pledgeId}`;

const LIST_KEY = 'cgoal:list';
const LIST_TTL_MS = 10_000;
const REFUND_BATCH = 200;
const NOTIFY_CAP = 500;
const MIN_DEADLINE_MS = 60 * 60_000;
const MAX_DEADLINE_MS = 366 * 86_400_000;

function bust(): void {
  apiCache.invalidate(LIST_KEY);
}

// ── admin: create / cancel / fulfil ──────────────────────────────────────────

export async function createCommunityGoal(
  adminId: string,
  input: CreateCommunityGoalInput,
  now: Date = new Date(),
): Promise<string> {
  const deadline = new Date(input.deadline);
  const ms = deadline.getTime() - now.getTime();
  if (!Number.isFinite(ms) || ms < MIN_DEADLINE_MS || ms > MAX_DEADLINE_MS) {
    throw new CommunityGoalError('BAD_DEADLINE');
  }
  const row = await prisma.communityGoal.create({
    data: {
      title: input.title,
      description: input.description,
      unlock: input.unlock,
      targetCoins: input.targetCoins,
      deadline,
      createdById: adminId,
    },
    select: { id: true },
  });
  bust();
  await logAdminAction(adminId, 'community_goal.create', {
    targetType: 'community_goal',
    targetId: row.id,
    detail: `${input.title} — ${input.targetCoins} coins`,
  });
  return row.id;
}

/** Cancel an OPEN or FUNDED goal and return every pledge. */
export async function cancelCommunityGoal(adminId: string, goalId: string): Promise<void> {
  const claim = await prisma.communityGoal.updateMany({
    where: { id: goalId, status: { in: ['OPEN', 'FUNDED'] } },
    data: { status: 'REFUNDING' },
  });
  if (claim.count === 0) {
    const exists = await prisma.communityGoal.findUnique({
      where: { id: goalId },
      select: { id: true },
    });
    throw new CommunityGoalError(exists ? 'BAD_STATE' : 'NOT_FOUND');
  }
  await logAdminAction(adminId, 'community_goal.cancel', {
    targetType: 'community_goal',
    targetId: goalId,
  });
  await refundGoal(goalId);
  bust();
}

/** Mark a FUNDED goal as delivered. */
export async function fulfilCommunityGoal(
  adminId: string,
  goalId: string,
  now: Date = new Date(),
): Promise<void> {
  const claim = await prisma.communityGoal.updateMany({
    where: { id: goalId, status: 'FUNDED' },
    data: { status: 'FULFILLED', fulfilledAt: now },
  });
  if (claim.count === 0) {
    const exists = await prisma.communityGoal.findUnique({
      where: { id: goalId },
      select: { id: true },
    });
    throw new CommunityGoalError(exists ? 'BAD_STATE' : 'NOT_FOUND');
  }
  bust();
  await logAdminAction(adminId, 'community_goal.fulfil', {
    targetType: 'community_goal',
    targetId: goalId,
  });
  await notifyPledgers(goalId, 'Your community goal was delivered — thank you for chipping in!');
}

// ── members: pledge ──────────────────────────────────────────────────────────

export interface PledgeResult {
  raisedCoins: number;
  targetCoins: number;
  funded: boolean;
  balance: number;
}

/**
 * Escrow `coins` toward a goal. The pledge row, the goal's running total and the
 * ledger debit commit together or not at all.
 */
export async function pledgeToGoal(
  goalId: string,
  userId: string,
  coins: number,
  now: Date = new Date(),
): Promise<PledgeResult> {
  let result: PledgeResult;
  try {
    result = await prisma.$transaction(async (tx) => {
      const goal = await tx.communityGoal.findUnique({
        where: { id: goalId },
        select: { id: true, status: true, deadline: true, targetCoins: true, raisedCoins: true },
      });
      if (!goal) throw new CommunityGoalError('NOT_FOUND');
      if (goal.status !== 'OPEN' || goal.deadline.getTime() <= now.getTime()) {
        throw new CommunityGoalError('CLOSED');
      }
      const remaining = goal.targetCoins - goal.raisedCoins;
      if (coins > remaining) throw new CommunityGoalError('EXCEEDS_REMAINING', remaining);

      // The guarded increment. Predicate and write are one statement, so a
      // concurrent pledge or the deadline sweep cannot be raced past.
      const claimed = await tx.communityGoal.updateMany({
        where: {
          id: goalId,
          status: 'OPEN',
          deadline: { gt: now },
          raisedCoins: { lte: goal.targetCoins - coins },
        },
        data: { raisedCoins: { increment: coins } },
      });
      if (claimed.count === 0) throw new CommunityGoalError('GOAL_CHANGED');

      // Row first: it carries the id the ledger key is built from, so every
      // escrowed coin is attributable to a refundable pledge.
      const pledge = await tx.communityGoalPledge.create({
        data: { goalId, userId, coins },
        select: { id: true },
      });
      await debitCoins(userId, coins, {
        tx,
        type: 'GIFT',
        note: 'Community goal pledge',
        entityType: 'cgoal',
        entityId: goalId,
        idempotencyKey: cgoalPledgeRefId(pledge.id),
      });

      const after = await tx.communityGoal.findUnique({
        where: { id: goalId },
        select: { raisedCoins: true, targetCoins: true },
      });
      const raised = after?.raisedCoins ?? goal.raisedCoins + coins;
      let funded = false;
      if (raised >= goal.targetCoins) {
        const f = await tx.communityGoal.updateMany({
          where: { id: goalId, status: 'OPEN' },
          data: { status: 'FUNDED', fundedAt: now },
        });
        funded = f.count > 0;
      }
      const profile = await tx.userProfile.findUnique({
        where: { userId },
        select: { coins: true },
      });
      return {
        raisedCoins: raised,
        targetCoins: goal.targetCoins,
        funded,
        balance: Number(profile?.coins ?? 0),
      };
    });
  } catch (err) {
    if (err instanceof InsufficientFundsError) throw new CommunityGoalError('INSUFFICIENT_COINS');
    throw err;
  }

  bust();
  if (result.funded) {
    await notifyPledgers(goalId, 'A community goal you pledged to has been fully funded!');
  }
  return result;
}

// ── refunds ──────────────────────────────────────────────────────────────────

export interface RefundGoalResult {
  pledgesRefunded: number;
  coinsReturned: number;
  skipped: number;
  goalMarked: boolean;
}

/**
 * Return every outstanding pledge of a goal that is in REFUNDING, then mark it
 * REFUNDED. Idempotent and resumable; never pays a pledge twice.
 */
export async function refundGoal(
  goalId: string,
  now: Date = new Date(),
): Promise<RefundGoalResult> {
  const out: RefundGoalResult = {
    pledgesRefunded: 0,
    coinsReturned: 0,
    skipped: 0,
    goalMarked: false,
  };

  for (;;) {
    const batch = await prisma.communityGoalPledge.findMany({
      where: { goalId, refundedAt: null },
      select: { id: true, userId: true, coins: true },
      orderBy: { id: 'asc' },
      take: REFUND_BATCH,
    });
    if (batch.length === 0) break;

    let progressed = false;
    for (const p of batch) {
      const paid = await refundPledge(p, goalId, now);
      if (paid) {
        out.pledgesRefunded += 1;
        out.coinsReturned += p.coins;
        progressed = true;
      } else {
        out.skipped += 1;
      }
    }
    if (batch.length < REFUND_BATCH || !progressed) break;
  }

  const remaining = await prisma.communityGoalPledge.count({
    where: { goalId, refundedAt: null },
  });
  if (remaining === 0) {
    const marked = await prisma.communityGoal.updateMany({
      where: { id: goalId, status: 'REFUNDING' },
      data: { status: 'REFUNDED', refundedAt: now },
    });
    out.goalMarked = marked.count > 0;
    if (out.goalMarked) {
      bust();
      await notifyPledgers(
        goalId,
        'A community goal you pledged to ended — your coins were refunded.',
      );
    }
  }
  return out;
}

async function refundPledge(
  p: { id: bigint; userId: string; coins: number },
  goalId: string,
  now: Date,
): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    const claim = await tx.communityGoalPledge.updateMany({
      where: { id: p.id, refundedAt: null },
      data: { refundedAt: now },
    });
    if (claim.count === 0) return false;

    await creditCoins(p.userId, p.coins, {
      tx,
      type: 'GIFT',
      note: 'Community goal refund',
      entityType: 'cgoal',
      entityId: goalId,
      idempotencyKey: cgoalRefundRefId(p.id),
    });
    return true;
  });
}

export interface SweepResult {
  goalsClosed: number;
  goalsRefunded: number;
  pledgesRefunded: number;
  coinsReturned: number;
  failed: number;
}

/**
 * The deadline job. Any OPEN goal past its deadline necessarily missed its
 * target (reaching it flips the goal to FUNDED immediately), so it is claimed
 * into REFUNDING and refunded; goals already in REFUNDING (a crashed earlier
 * run, an admin cancel) are resumed.
 */
export async function sweepCommunityGoals(now: Date = new Date()): Promise<SweepResult> {
  const res: SweepResult = {
    goalsClosed: 0,
    goalsRefunded: 0,
    pledgesRefunded: 0,
    coinsReturned: 0,
    failed: 0,
  };

  const due = await prisma.communityGoal.findMany({
    where: { status: 'OPEN', deadline: { lte: now } },
    select: { id: true },
    orderBy: { deadline: 'asc' },
    take: 50,
  });
  for (const { id } of due) {
    const claim = await prisma.communityGoal.updateMany({
      where: { id, status: 'OPEN', deadline: { lte: now } },
      data: { status: 'REFUNDING' },
    });
    res.goalsClosed += claim.count;
  }

  const refunding = await prisma.communityGoal.findMany({
    where: { status: 'REFUNDING' },
    select: { id: true },
    orderBy: { deadline: 'asc' },
    take: 25,
  });
  for (const { id } of refunding) {
    try {
      const r = await refundGoal(id, now);
      res.pledgesRefunded += r.pledgesRefunded;
      res.coinsReturned += r.coinsReturned;
      if (r.goalMarked) res.goalsRefunded += 1;
    } catch (err) {
      // One bad goal must not stall the rest of the queue; it is retried next run.
      res.failed += 1;
      console.error('[community-goals] refund failed for goal', id, err);
    }
  }
  if (res.goalsClosed > 0) bust();
  return res;
}

// ── notifications ────────────────────────────────────────────────────────────

async function notifyPledgers(goalId: string, preview: string): Promise<void> {
  try {
    const rows = await prisma.communityGoalPledge.findMany({
      where: { goalId },
      distinct: ['userId'],
      select: { userId: true },
      take: NOTIFY_CAP,
    });
    await Promise.all(
      rows.map((r) =>
        createNotification({
          userId: r.userId,
          type: 'SYSTEM',
          entityType: 'cgoal',
          entityId: goalId,
          preview,
          link: '/wallet?tab=community',
        }),
      ),
    );
  } catch (err) {
    console.error('[community-goals] notify failed:', err);
  }
}

// ── reads ────────────────────────────────────────────────────────────────────

interface BaseGoal {
  id: string;
  title: string;
  description: string;
  unlock: string;
  targetCoins: number;
  raisedCoins: number;
  deadline: string;
  status: CommunityGoalStatus;
  pledgers: number;
}

/** Goals newest first: open and funded ones lead, recent history follows. */
export async function listCommunityGoals(viewerId: string | null): Promise<CommunityGoalView[]> {
  let base = apiCache.get<BaseGoal[]>(LIST_KEY);
  if (!base) {
    const rows = await prisma.communityGoal.findMany({
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
    const counts = rows.length
      ? await prisma.$queryRaw<{ goalId: string; n: bigint }[]>`
          SELECT "goalId", COUNT(DISTINCT "userId") AS n
          FROM community_goal_pledge
          WHERE "goalId" = ANY(${rows.map((r) => r.id)})
          GROUP BY "goalId"`
      : [];
    const byGoal = new Map(counts.map((c) => [c.goalId, Number(c.n)]));
    base = rows.map((g) => ({
      id: g.id,
      title: g.title,
      description: g.description,
      unlock: g.unlock,
      targetCoins: g.targetCoins,
      raisedCoins: g.raisedCoins,
      deadline: g.deadline.toISOString(),
      status: g.status as CommunityGoalStatus,
      pledgers: byGoal.get(g.id) ?? 0,
    }));
    apiCache.set(LIST_KEY, base, LIST_TTL_MS);
  }

  const mine = new Map<string, { pledged: number; refunded: number }>();
  if (viewerId && base.length > 0) {
    const rows = await prisma.communityGoalPledge.findMany({
      where: { userId: viewerId, goalId: { in: base.map((b) => b.id) } },
      select: { goalId: true, coins: true, refundedAt: true },
      take: 500,
    });
    for (const r of rows) {
      const m = mine.get(r.goalId) ?? { pledged: 0, refunded: 0 };
      if (r.refundedAt) m.refunded += r.coins;
      else m.pledged += r.coins;
      mine.set(r.goalId, m);
    }
  }

  return base.map((g) => ({
    ...g,
    myPledge: mine.get(g.id)?.pledged ?? 0,
    myRefunded: mine.get(g.id)?.refunded ?? 0,
  }));
}
