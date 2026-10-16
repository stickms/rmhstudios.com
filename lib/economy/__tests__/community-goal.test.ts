import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * Community goal pots (C5) — the pledge / refund guarantees.
 *
 * The property that matters is the one Kickstarter sells: all or nothing, and
 * "nothing" means every pledged coin goes back exactly once. The tests drive the
 * real module against an in-memory database with real rollback semantics and a
 * ledger that rejects repeated idempotency keys (see ./fake-db.ts).
 */

const w = await vi.hoisted(async () => {
  const { Table, FakeLedger, makeTransaction } = await import('./fake-db');
  const goals = new Table({ defaults: () => ({ status: 'OPEN', raisedCoins: 0, fundedAt: null }) });
  const pledges = new Table({
    bigintId: true,
    defaults: () => ({ refundedAt: null, createdAt: new Date() }),
  });
  const ledger = new FakeLedger();
  const notified: { userId: string; preview: string }[] = [];
  const prisma: Record<string, unknown> = {
    communityGoal: goals.api,
    communityGoalPledge: pledges.api,
    userProfile: {
      findUnique: async ({ where }: { where: { userId: string } }) => ({
        coins: ledger.balance(where.userId),
      }),
    },
    $queryRaw: async () => [],
  };
  prisma.$transaction = makeTransaction([goals, pledges], ledger, () => prisma);
  return { goals, pledges, ledger, prisma, notified };
});

vi.mock('@/lib/prisma.server', () => ({ prisma: w.prisma }));
vi.mock('@/lib/economy/ledger.server', async () => {
  const { FakeInsufficientFundsError } = await import('./fake-db');
  return {
    InsufficientFundsError: FakeInsufficientFundsError,
    debitCoins: (u: string, a: number, o: object) => w.ledger.debit(u, a, o),
    creditCoins: (u: string, a: number, o: object) => w.ledger.credit(u, a, o),
  };
});
vi.mock('@/lib/notifications.server', () => ({
  createNotification: async (n: { userId: string; preview: string }) => {
    w.notified.push(n);
  },
}));
vi.mock('@/lib/admin-audit.server', () => ({ logAdminAction: async () => undefined }));

import {
  cancelCommunityGoal,
  CommunityGoalError,
  fulfilCommunityGoal,
  pledgeToGoal,
  refundGoal,
  sweepCommunityGoals,
} from '@/lib/economy/community-goal.server';

const NOW = new Date('2026-10-12T12:00:00Z');
const FUTURE = new Date('2026-10-20T12:00:00Z');
const PAST = new Date('2026-10-11T12:00:00Z');

function seedGoal(over: Record<string, unknown> = {}) {
  return w.goals.insert({
    id: 'g1',
    title: 'New theme',
    unlock: 'Aurora',
    targetCoins: 1000,
    deadline: FUTURE,
    createdById: 'admin',
    ...over,
  });
}

const goal = () => w.goals.rows.find((g) => g.id === 'g1')!;
const totalCredited = () =>
  w.ledger.calls.filter((c) => c.kind === 'credit').reduce((a, c) => a + c.amount, 0);

beforeEach(() => {
  w.goals.reset();
  w.pledges.reset();
  w.ledger.reset();
  w.notified.length = 0;
  w.ledger.balances.set('alice', 600);
  w.ledger.balances.set('bob', 600);
});

describe('pledgeToGoal', () => {
  it('debits the member through the ledger and records a refundable pledge', async () => {
    seedGoal();
    const r = await pledgeToGoal('g1', 'alice', 300, NOW);

    expect(r).toMatchObject({ raisedCoins: 300, funded: false, balance: 300 });
    expect(goal().raisedCoins).toBe(300);
    expect(w.pledges.rows).toHaveLength(1);
    expect(w.ledger.calls[0]).toMatchObject({ kind: 'debit', userId: 'alice', amount: 300 });
    // The ledger key is derived from the pledge row, so the debit is attributable.
    expect(w.ledger.calls[0]!.key).toBe(`cgoal-pledge:${w.pledges.rows[0]!.id}`);
  });

  it('flips to FUNDED the moment the target is met, and then closes to new pledges', async () => {
    seedGoal({ targetCoins: 800 });
    await pledgeToGoal('g1', 'alice', 500, NOW);
    const r = await pledgeToGoal('g1', 'bob', 300, NOW);

    expect(r.funded).toBe(true);
    expect(goal().status).toBe('FUNDED');
    expect(goal().fundedAt).toEqual(NOW);
    await expect(pledgeToGoal('g1', 'alice', 1, NOW)).rejects.toMatchObject({ code: 'CLOSED' });
    // Pledgers were told.
    expect(w.notified.map((n) => n.userId).sort()).toEqual(['alice', 'bob']);
  });

  it('refuses a pledge larger than what remains, without debiting', async () => {
    seedGoal({ targetCoins: 500 });
    await expect(pledgeToGoal('g1', 'alice', 501, NOW)).rejects.toMatchObject({
      code: 'EXCEEDS_REMAINING',
      detail: 500,
    });
    expect(w.ledger.balance('alice')).toBe(600);
    expect(w.pledges.rows).toHaveLength(0);
  });

  it('rolls everything back when the member cannot afford it', async () => {
    seedGoal();
    w.ledger.balances.set('alice', 50);
    await expect(pledgeToGoal('g1', 'alice', 100, NOW)).rejects.toMatchObject({
      code: 'INSUFFICIENT_COINS',
    });
    expect(goal().raisedCoins).toBe(0);
    expect(w.pledges.rows).toHaveLength(0);
    expect(w.ledger.balance('alice')).toBe(50);
  });

  it('refuses a pledge after the deadline', async () => {
    seedGoal({ deadline: PAST });
    await expect(pledgeToGoal('g1', 'alice', 100, NOW)).rejects.toMatchObject({ code: 'CLOSED' });
    expect(w.ledger.calls).toHaveLength(0);
  });

  it('404s an unknown goal', async () => {
    await expect(pledgeToGoal('nope', 'alice', 100, NOW)).rejects.toBeInstanceOf(
      CommunityGoalError,
    );
  });
});

describe('sweepCommunityGoals — the all-or-nothing refund', () => {
  async function pledgeTwo() {
    seedGoal();
    await pledgeToGoal('g1', 'alice', 300, new Date('2026-10-12T10:00:00Z'));
    await pledgeToGoal('g1', 'bob', 200, new Date('2026-10-12T10:00:00Z'));
  }
  const afterDeadline = new Date('2026-10-21T00:00:00Z');

  it('refunds every pledge of a goal that missed its target, then marks it REFUNDED', async () => {
    await pledgeTwo();
    const r = await sweepCommunityGoals(afterDeadline);

    expect(r).toMatchObject({
      goalsClosed: 1,
      goalsRefunded: 1,
      pledgesRefunded: 2,
      coinsReturned: 500,
    });
    expect(goal().status).toBe('REFUNDED');
    expect(w.ledger.balance('alice')).toBe(600);
    expect(w.ledger.balance('bob')).toBe(600);
    expect(w.pledges.rows.every((p) => p.refundedAt)).toBe(true);
  });

  it('is idempotent: running again pays nobody a second time', async () => {
    await pledgeTwo();
    await sweepCommunityGoals(afterDeadline);
    const credited = totalCredited();
    const again = await sweepCommunityGoals(afterDeadline);

    expect(again.pledgesRefunded).toBe(0);
    expect(totalCredited()).toBe(credited);
    expect(w.ledger.balance('alice')).toBe(600);
  });

  it('two overlapping sweeps still refund each pledge exactly once', async () => {
    await pledgeTwo();
    await Promise.all([sweepCommunityGoals(afterDeadline), sweepCommunityGoals(afterDeadline)]);
    expect(totalCredited()).toBe(500);
    expect(w.ledger.balance('alice') + w.ledger.balance('bob')).toBe(1200);
  });

  it('the ledger key alone blocks a double refund even if the claim were bypassed', async () => {
    await pledgeTwo();
    await sweepCommunityGoals(afterDeadline);
    // Simulate a restore from backup: pledges look unrefunded again.
    for (const p of w.pledges.rows) p.refundedAt = null;
    goal().status = 'REFUNDING';
    await refundGoal('g1', afterDeadline);
    expect(totalCredited()).toBe(500);
  });

  it('resumes after a mid-sweep failure without losing or doubling a refund', async () => {
    await pledgeTwo();
    // Fail the SECOND pledge's credit once.
    w.ledger.failCreditKeyEndingWith = String(w.pledges.rows[1]!.id);
    const first = await sweepCommunityGoals(afterDeadline);

    expect(first.failed).toBe(1);
    expect(goal().status).toBe('REFUNDING'); // not marked done while money is owed
    expect(w.pledges.rows[1]!.refundedAt).toBeNull(); // the claim unwound with the failed credit

    await sweepCommunityGoals(afterDeadline);
    expect(goal().status).toBe('REFUNDED');
    expect(totalCredited()).toBe(500);
    expect(w.ledger.balance('alice')).toBe(600);
    expect(w.ledger.balance('bob')).toBe(600);
  });

  it('leaves a funded goal alone — those coins stay spent', async () => {
    seedGoal({ targetCoins: 500 });
    await pledgeToGoal('g1', 'alice', 500, NOW);
    expect(goal().status).toBe('FUNDED');

    const r = await sweepCommunityGoals(afterDeadline);
    expect(r.goalsClosed).toBe(0);
    expect(goal().status).toBe('FUNDED');
    expect(totalCredited()).toBe(0);
  });

  it('leaves an open goal alone before its deadline', async () => {
    await pledgeTwo();
    const r = await sweepCommunityGoals(NOW);
    expect(r.goalsClosed).toBe(0);
    expect(goal().status).toBe('OPEN');
    expect(totalCredited()).toBe(0);
  });

  it('a goal with no pledges simply closes', async () => {
    seedGoal();
    await sweepCommunityGoals(afterDeadline);
    expect(goal().status).toBe('REFUNDED');
  });
});

describe('admin actions', () => {
  it('cancelling a funded goal refunds everyone', async () => {
    seedGoal({ targetCoins: 500 });
    await pledgeToGoal('g1', 'alice', 300, NOW);
    await pledgeToGoal('g1', 'bob', 200, NOW);
    expect(goal().status).toBe('FUNDED');

    await cancelCommunityGoal('admin', 'g1');
    expect(goal().status).toBe('REFUNDED');
    expect(w.ledger.balance('alice')).toBe(600);
    expect(w.ledger.balance('bob')).toBe(600);
  });

  it('cannot cancel a fulfilled goal, nor fulfil one that is not funded', async () => {
    seedGoal({ targetCoins: 500 });
    await expect(fulfilCommunityGoal('admin', 'g1')).rejects.toMatchObject({ code: 'BAD_STATE' });

    await pledgeToGoal('g1', 'alice', 500, NOW);
    await fulfilCommunityGoal('admin', 'g1', NOW);
    expect(goal().status).toBe('FULFILLED');
    await expect(cancelCommunityGoal('admin', 'g1')).rejects.toMatchObject({ code: 'BAD_STATE' });
    expect(totalCredited()).toBe(0);
  });
});
