import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Trade offers against an in-memory database. As in the market test, a conditional
 * `updateMany` is one atomic step, a transaction commits or rolls back whole and
 * transactions are serialised (the advisory lock), so the races below are real races
 * through the same code paths.
 */

type Item = { fromGives: boolean; gameId: string; cardIndex: number; foil: boolean; qty: number };
type Trade = {
  id: string;
  fromId: string;
  toId: string;
  status: 'PENDING' | 'ACCEPTED' | 'DECLINED' | 'CANCELED';
  createdAt: Date;
  closedAt: Date | null;
  expiresAt: Date;
  items: Item[];
};

const db = vi.hoisted(() => ({
  cards: new Map<string, number>(),
  trades: new Map<string, Trade>(),
  users: new Set<string>(),
  follows: [] as { followerId: string; followingId: string }[],
  seq: 0,
}));

const key = (u: string, g: string, i: number, f: boolean) => `${u}|${g}|${i}|${f}`;

const prismaMock = vi.hoisted(() => {
  const m: Record<string, unknown> = {
    user: {
      findMany: async ({ where }: { where: { id: { in: string[] } } }) =>
        where.id.in.filter((id) => db.users.has(id)).map((id) => ({ id })),
    },
    follow: {
      findFirst: async ({ where }: { where: { OR: { followerId: string; followingId: string }[] } }) =>
        db.follows.find((f) => where.OR.some((c) => c.followerId === f.followerId && c.followingId === f.followingId)) ?? null,
    },
    userCard: {
      findUnique: async ({ where }: { where: { userId_gameId_cardIndex_foil: { userId: string; gameId: string; cardIndex: number; foil: boolean } } }) => {
        const w = where.userId_gameId_cardIndex_foil;
        const c = db.cards.get(key(w.userId, w.gameId, w.cardIndex, w.foil));
        return c === undefined ? null : { count: c };
      },
      update: async ({ where, data }: { where: { userId_gameId_cardIndex_foil: { userId: string; gameId: string; cardIndex: number; foil: boolean } }; data: { count: { decrement: number } } }) => {
        const w = where.userId_gameId_cardIndex_foil;
        const k = key(w.userId, w.gameId, w.cardIndex, w.foil);
        db.cards.set(k, (db.cards.get(k) ?? 0) - data.count.decrement);
      },
      delete: async ({ where }: { where: { userId_gameId_cardIndex_foil: { userId: string; gameId: string; cardIndex: number; foil: boolean } } }) => {
        const w = where.userId_gameId_cardIndex_foil;
        db.cards.delete(key(w.userId, w.gameId, w.cardIndex, w.foil));
      },
      upsert: async ({ where, create, update }: { where: { userId_gameId_cardIndex_foil: { userId: string; gameId: string; cardIndex: number; foil: boolean } }; create: { count: number }; update: { count: { increment: number } } }) => {
        const w = where.userId_gameId_cardIndex_foil;
        const k = key(w.userId, w.gameId, w.cardIndex, w.foil);
        db.cards.set(k, db.cards.has(k) ? (db.cards.get(k) as number) + update.count.increment : create.count);
      },
    },
    cardTrade: {
      count: async ({ where }: { where: { fromId: string; status: string } }) =>
        [...db.trades.values()].filter((t) => t.fromId === where.fromId && t.status === where.status).length,
      create: async ({ data }: { data: { fromId: string; toId: string; expiresAt: Date; items: { create: Item[] } } }) => {
        const t: Trade = { id: `T${++db.seq}`, fromId: data.fromId, toId: data.toId, status: 'PENDING', createdAt: new Date(), closedAt: null, expiresAt: data.expiresAt, items: data.items.create };
        db.trades.set(t.id, t);
        return t;
      },
      findUnique: async ({ where }: { where: { id: string } }) => db.trades.get(where.id) ?? null,
      updateMany: async ({ where, data }: { where: { id: string; status: string; toId?: string; fromId?: string }; data: Partial<Trade> }) => {
        const t = db.trades.get(where.id);
        if (!t || t.status !== where.status) return { count: 0 };
        if (where.toId && t.toId !== where.toId) return { count: 0 };
        if (where.fromId && t.fromId !== where.fromId) return { count: 0 };
        Object.assign(t, data);
        return { count: 1 };
      },
    },
    $executeRaw: async () => 0,
  };
  let chain: Promise<unknown> = Promise.resolve();
  m.$transaction = (fn: (tx: unknown) => Promise<unknown>) => {
    const run = async () => {
      const cards = new Map(db.cards);
      const trades = new Map([...db.trades].map(([k, v]) => [k, { ...v }]));
      try {
        return await fn(m);
      } catch (e) {
        db.cards = cards;
        db.trades = trades;
        throw e;
      }
    };
    const next = chain.then(run, run);
    chain = next.catch(() => {});
    return next;
  };
  return m;
});

vi.mock('@/lib/prisma.server', () => ({ prisma: prismaMock }));

import { acceptTrade, cancelTrade, declineTrade, proposeTrade, TradeError } from '@/lib/cards/trades.server';

const A = 'alice';
const B = 'bob';
const G = 'altair';
const item = (cardIndex: number, qty = 1, foil = false) => ({ gameId: G, cardIndex, foil, qty });
const held = (u: string, i: number, f = false) => db.cards.get(key(u, G, i, f)) ?? 0;
const total = () => [...db.cards.values()].reduce((n, c) => n + c, 0);
const code = (p: Promise<unknown>) =>
  p.then(
    () => null,
    (e) => (e instanceof TradeError ? e.code : `other:${(e as Error).message}`),
  );

beforeEach(() => {
  db.cards.clear();
  db.trades.clear();
  db.users = new Set([A, B, 'carol']);
  db.follows = [{ followerId: B, followingId: A }];
  db.seq = 0;
  db.cards.set(key(A, G, 0, false), 2);
  db.cards.set(key(B, G, 1, false), 1);
});

const offer = (over: Partial<Parameters<typeof proposeTrade>[0]> = {}) => ({
  fromId: A,
  toId: B,
  give: [item(0)],
  ask: [item(1)],
  ...over,
});

describe('proposeTrade', () => {
  it('creates a pending offer without moving any card', async () => {
    const t = await proposeTrade(offer());
    expect(t.status).toBe('PENDING');
    expect(held(A, 0)).toBe(2);
    expect(held(B, 1)).toBe(1);
  });

  it('refuses yourself, strangers, unknown users, empty and malformed offers', async () => {
    expect(await code(proposeTrade(offer({ toId: A })))).toBe('BAD_OFFER');
    expect(await code(proposeTrade(offer({ toId: 'carol' })))).toBe('NOT_FRIENDS');
    expect(await code(proposeTrade(offer({ toId: 'ghost' })))).toBe('NOT_FOUND');
    expect(await code(proposeTrade(offer({ give: [], ask: [] })))).toBe('BAD_OFFER');
    expect(await code(proposeTrade(offer({ give: [{ ...item(0), gameId: 'nope' }] })))).toBe('BAD_OFFER');
  });

  it('allows friendship in either direction', async () => {
    db.follows = [{ followerId: A, followingId: B }];
    expect(await code(proposeTrade(offer()))).toBeNull();
  });

  it('will not offer cards you do not hold', async () => {
    expect(await code(proposeTrade(offer({ give: [item(0, 3)] })))).toBe('MISSING_CARDS');
    expect(await code(proposeTrade(offer({ give: [item(4)] })))).toBe('MISSING_CARDS');
  });

  it('caps pending offers per proposer', async () => {
    for (let i = 0; i < 20; i++) await proposeTrade(offer());
    expect(await code(proposeTrade(offer()))).toBe('TOO_MANY_PENDING');
  });
});

describe('acceptTrade', () => {
  it('swaps the cards and conserves their total', async () => {
    const t = await proposeTrade(offer());
    const before = total();
    await acceptTrade({ userId: B, tradeId: t.id });
    expect(held(A, 0)).toBe(1);
    expect(held(B, 0)).toBe(1);
    expect(held(B, 1)).toBe(0);
    expect(held(A, 1)).toBe(1);
    expect(total()).toBe(before);
    expect(db.trades.get(t.id)?.status).toBe('ACCEPTED');
  });

  it('moves quantities and removes a stack that reaches zero', async () => {
    db.cards.set(key(A, G, 0, false), 3);
    const t = await proposeTrade(offer({ give: [item(0, 3)], ask: [] }));
    await acceptTrade({ userId: B, tradeId: t.id });
    expect(db.cards.has(key(A, G, 0, false))).toBe(false);
    expect(held(B, 0)).toBe(3);
  });

  it('fails whole if the proposer no longer holds a card: nothing moves', async () => {
    const t = await proposeTrade(offer());
    db.cards.set(key(A, G, 0, false), 0);
    db.cards.delete(key(A, G, 0, false));
    const before = new Map(db.cards);
    expect(await code(acceptTrade({ userId: B, tradeId: t.id }))).toBe('MISSING_CARDS');
    expect(db.cards).toEqual(before);
    expect(db.trades.get(t.id)?.status).toBe('PENDING');
  });

  it('fails whole if the recipient no longer holds the asked card', async () => {
    const t = await proposeTrade(offer());
    db.cards.delete(key(B, G, 1, false));
    expect(await code(acceptTrade({ userId: B, tradeId: t.id }))).toBe('MISSING_CARDS');
    expect(held(A, 0)).toBe(2);
  });

  it('only the recipient can accept', async () => {
    const t = await proposeTrade(offer());
    expect(await code(acceptTrade({ userId: A, tradeId: t.id }))).toBe('FORBIDDEN');
    expect(await code(acceptTrade({ userId: 'carol', tradeId: t.id }))).toBe('FORBIDDEN');
  });

  it('resolves once: a second accept is refused and moves nothing', async () => {
    const t = await proposeTrade(offer());
    await acceptTrade({ userId: B, tradeId: t.id });
    const before = new Map(db.cards);
    expect(await code(acceptTrade({ userId: B, tradeId: t.id }))).toBe('NOT_AVAILABLE');
    expect(db.cards).toEqual(before);
  });

  it('two accepts racing: exactly one swaps', async () => {
    const t = await proposeTrade(offer());
    const r = await Promise.all([acceptTrade({ userId: B, tradeId: t.id }).then(() => null, (e) => e.code), acceptTrade({ userId: B, tradeId: t.id }).then(() => null, (e) => e.code)]);
    expect(r.filter((x) => x === null)).toHaveLength(1);
    expect(held(A, 1)).toBe(1);
    expect(held(B, 0)).toBe(1);
  });

  it('the same card promised in two offers can only be delivered once', async () => {
    db.cards.set(key(A, G, 0, false), 1);
    const t1 = await proposeTrade(offer({ ask: [] }));
    const t2 = await proposeTrade(offer({ ask: [] }));
    await acceptTrade({ userId: B, tradeId: t1.id });
    expect(await code(acceptTrade({ userId: B, tradeId: t2.id }))).toBe('MISSING_CARDS');
    expect(held(B, 0)).toBe(1);
    expect(held(A, 0)).toBe(0);
  });

  it('refuses an expired offer', async () => {
    const t = await proposeTrade(offer());
    db.trades.get(t.id)!.expiresAt = new Date(Date.now() - 1000);
    expect(await code(acceptTrade({ userId: B, tradeId: t.id }))).toBe('EXPIRED');
    expect(held(A, 0)).toBe(2);
  });
});

describe('decline and cancel', () => {
  it('the recipient declines, the proposer cancels, nobody else can, and only once', async () => {
    const t = await proposeTrade(offer());
    expect(await code(declineTrade({ userId: A, tradeId: t.id }))).toBe('NOT_AVAILABLE');
    expect(await code(cancelTrade({ userId: B, tradeId: t.id }))).toBe('NOT_AVAILABLE');
    await declineTrade({ userId: B, tradeId: t.id });
    expect(db.trades.get(t.id)?.status).toBe('DECLINED');
    expect(await code(cancelTrade({ userId: A, tradeId: t.id }))).toBe('NOT_AVAILABLE');
    const t2 = await proposeTrade(offer());
    await cancelTrade({ userId: A, tradeId: t2.id });
    expect(db.trades.get(t2.id)?.status).toBe('CANCELED');
  });

  it('an accept racing a cancel resolves one way and moves cards only if accepted', async () => {
    const t = await proposeTrade(offer());
    const before = total();
    await Promise.all([code(acceptTrade({ userId: B, tradeId: t.id })), code(cancelTrade({ userId: A, tradeId: t.id }))]);
    expect(total()).toBe(before);
    const accepted = db.trades.get(t.id)?.status === 'ACCEPTED';
    expect(held(A, 1)).toBe(accepted ? 1 : 0);
  });
});
