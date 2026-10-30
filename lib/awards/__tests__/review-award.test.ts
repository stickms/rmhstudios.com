import { beforeEach, describe, expect, it, vi } from 'vitest';

/** Awarding a game review: the existing award path, with `review` as the entity. */

const db = vi.hoisted(() => ({
  reviews: new Map<string, { userId: string }>(),
  awards: [] as { awardId: string; giverId: string; entityType: string; entityId: string }[],
  coins: new Map<string, number>(),
  burned: 0,
  notified: [] as { userId: string; entityType: string }[],
}));

vi.mock('@/lib/prisma.server', () => {
  const m: Record<string, unknown> = {
    gameReview: { findUnique: async ({ where }: { where: { id: string } }) => db.reviews.get(where.id) ?? null },
    userProfile: { findUnique: async ({ where }: { where: { userId: string } }) => ({ coins: BigInt(db.coins.get(where.userId) ?? 0) }) },
    contentAward: {
      create: async ({ data }: { data: { awardId: string; giverId: string; entityType: string; entityId: string } }) => {
        db.awards.push({ ...data });
      },
    },
  };
  m.$transaction = async (fn: (tx: unknown) => Promise<unknown>) => {
    const snap = { awards: [...db.awards], coins: new Map(db.coins), burned: db.burned };
    try {
      return await fn(m);
    } catch (e) {
      db.awards = snap.awards;
      db.coins = snap.coins;
      db.burned = snap.burned;
      throw e;
    }
  };
  return { prisma: m };
});
vi.mock('@/lib/economy/ledger.server', async () => {
  const actual = await vi.importActual<typeof import('@/lib/economy/ledger-core')>('@/lib/economy/ledger-core');
  return {
    InsufficientFundsError: actual.InsufficientFundsError,
    transferCoins: async (from: string, to: string, amount: number, opts: { fee?: number }) => {
      if ((db.coins.get(from) ?? 0) < amount) throw new actual.InsufficientFundsError(from, amount);
      const fee = opts.fee ?? 0;
      db.coins.set(from, (db.coins.get(from) ?? 0) - amount);
      db.coins.set(to, (db.coins.get(to) ?? 0) + amount - fee);
      db.burned += fee;
      return { applied: true, replayed: false, id: 'x' };
    },
  };
});
vi.mock('@/lib/notify/dispatch.server', () => ({
  dispatch: async (n: { userId: string; entityType: string }) => {
    db.notified.push({ userId: n.userId, entityType: n.entityType });
  },
}));

import { giveAward, AwardError } from '@/lib/awards/awards.server';

const code = (p: Promise<unknown>) => p.then(() => null, (e) => (e instanceof AwardError ? e.message : `other:${(e as Error).message}`));

beforeEach(() => {
  db.reviews = new Map([['r1', { userId: 'author' }]]);
  db.awards = [];
  db.coins = new Map([['giver', 1000], ['author', 0]]);
  db.burned = 0;
  db.notified = [];
});

describe('awarding a review', () => {
  it('pays the author their share, burns the rest, records the award and notifies', async () => {
    await giveAward('giver', { awardId: 'gold', entityType: 'review', entityId: 'r1' });
    expect(db.coins.get('giver')).toBe(500);
    expect(db.coins.get('author')).toBe(300); // 60% of 500
    expect(db.burned).toBe(200);
    expect(db.awards).toEqual([{ awardId: 'gold', giverId: 'giver', entityType: 'review', entityId: 'r1', anonymous: false }]);
    expect(db.notified).toEqual([{ userId: 'author', entityType: 'review' }]);
  });

  it('conserves coins except for the burn', async () => {
    const before = [...db.coins.values()].reduce((n, c) => n + c, 0);
    await giveAward('giver', { awardId: 'silver', entityType: 'review', entityId: 'r1' });
    const after = [...db.coins.values()].reduce((n, c) => n + c, 0);
    expect(before - after).toBe(db.burned);
  });

  it('refuses your own review, a missing review and an unknown award, moving nothing', async () => {
    expect(await code(giveAward('author', { awardId: 'gold', entityType: 'review', entityId: 'r1' }))).toBe('SELF_AWARD');
    expect(await code(giveAward('giver', { awardId: 'gold', entityType: 'review', entityId: 'nope' }))).toBe('ENTITY_NOT_FOUND');
    expect(await code(giveAward('giver', { awardId: 'nope', entityType: 'review', entityId: 'r1' }))).toBe('UNKNOWN_AWARD');
    expect(db.awards).toEqual([]);
    expect(db.coins.get('giver')).toBe(1000);
  });

  it('with too few coins, no award is recorded and nobody is notified', async () => {
    db.coins.set('giver', 10);
    expect(await code(giveAward('giver', { awardId: 'gold', entityType: 'review', entityId: 'r1' }))).toBe('INSUFFICIENT_COINS');
    expect(db.awards).toEqual([]);
    expect(db.notified).toEqual([]);
    expect(db.coins.get('author')).toBe(0);
  });
});
