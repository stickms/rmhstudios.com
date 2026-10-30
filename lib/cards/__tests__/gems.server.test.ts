import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({
  cards: new Map<string, number>(),
  gems: new Map<string, number>(),
  entries: [] as { userId: string; delta: number; reason: string }[],
  coins: new Map<string, number>(),
  burned: 0,
}));
const key = (u: string, g: string, i: number, f: boolean) => `${u}|${g}|${i}|${f}`;

const prismaMock = vi.hoisted(() => {
  const m: Record<string, unknown> = {
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
    userGems: {
      findUnique: async ({ where }: { where: { userId: string } }) => (db.gems.has(where.userId) ? { gems: db.gems.get(where.userId) } : null),
      upsert: async ({ where, create, update }: { where: { userId: string }; create: { gems: number }; update: { gems: { increment: number } } }) => {
        db.gems.set(where.userId, db.gems.has(where.userId) ? (db.gems.get(where.userId) as number) + update.gems.increment : create.gems);
      },
      updateMany: async ({ where, data }: { where: { userId: string; gems: { gte: number } }; data: { gems: { decrement: number } } }) => {
        const cur = db.gems.get(where.userId) ?? 0;
        if (cur < where.gems.gte) return { count: 0 };
        db.gems.set(where.userId, cur - data.gems.decrement);
        return { count: 1 };
      },
    },
    gemEntry: { create: async ({ data }: { data: { userId: string; delta: number; reason: string } }) => { db.entries.push({ ...data }); } },
    $executeRaw: async () => 0,
  };
  let chain: Promise<unknown> = Promise.resolve();
  m.$transaction = (fn: (tx: unknown) => Promise<unknown>) => {
    const run = async () => {
      const snap = { cards: new Map(db.cards), gems: new Map(db.gems), entries: [...db.entries], coins: new Map(db.coins), burned: db.burned };
      try { return await fn(m); } catch (e) { Object.assign(db, snap); throw e; }
    };
    const next = chain.then(run, run);
    chain = next.catch(() => {});
    return next;
  };
  return m;
});

vi.mock('@/lib/prisma.server', () => ({ prisma: prismaMock }));
vi.mock('@/lib/economy/ledger.server', async () => {
  const actual = await vi.importActual<typeof import('@/lib/economy/ledger-core')>('@/lib/economy/ledger-core');
  return {
    InsufficientFundsError: actual.InsufficientFundsError,
    debitCoins: async (userId: string, amount: number) => {
      if ((db.coins.get(userId) ?? 0) < amount) throw new actual.InsufficientFundsError(userId, amount);
      db.coins.set(userId, (db.coins.get(userId) ?? 0) - amount);
      db.burned += amount;
      return { applied: true, replayed: false, id: 'x' };
    },
  };
});

import { GemError, buyGems, getGems, openPack, unpackCards } from '@/lib/cards/gems.server';
import { FOIL_GEMS, GEMS_PER_CARD, PACK_COST, PACK_SIZE } from '@/lib/cards/gems';

const U = 'u1';
const G = 'altair';
const code = (p: Promise<unknown>) => p.then(() => null, (e) => (e instanceof GemError ? e.code : `other:${(e as Error).message}`));
const held = (i: number, f = false) => db.cards.get(key(U, G, i, f)) ?? 0;
const sumEntries = () => db.entries.filter((e) => e.userId === U).reduce((n, e) => n + e.delta, 0);

beforeEach(() => {
  db.cards.clear(); db.gems.clear(); db.entries.length = 0; db.coins.clear(); db.burned = 0;
  db.cards.set(key(U, G, 1, false), 3);
  db.cards.set(key(U, G, 2, true), 1);
  db.coins.set(U, 1000);
});

describe('unpackCards', () => {
  it('destroys cards for gems and records the entry', async () => {
    const r = await unpackCards({ userId: U, gameId: G, cardIndex: 1, foil: false, qty: 2 });
    expect(r.gems).toBe(2 * GEMS_PER_CARD);
    expect(held(1)).toBe(1);
    expect(await getGems(U)).toBe(20);
    expect(db.entries).toEqual([{ userId: U, delta: 20, reason: 'unpack' }]);
  });

  it('a foil is worth more, and a stack that hits zero is removed', async () => {
    await unpackCards({ userId: U, gameId: G, cardIndex: 2, foil: true, qty: 1 });
    expect(await getGems(U)).toBe(FOIL_GEMS);
    expect(db.cards.has(key(U, G, 2, true))).toBe(false);
  });

  it('cannot unpack more than held, and nothing changes when it refuses', async () => {
    expect(await code(unpackCards({ userId: U, gameId: G, cardIndex: 1, foil: false, qty: 4 }))).toBe('NOT_ENOUGH');
    expect(await code(unpackCards({ userId: U, gameId: G, cardIndex: 4, foil: false, qty: 1 }))).toBe('NOT_ENOUGH');
    expect(held(1)).toBe(3);
    expect(await getGems(U)).toBe(0);
  });

  it('validates quantity, title and card index', async () => {
    expect(await code(unpackCards({ userId: U, gameId: G, cardIndex: 1, foil: false, qty: 0 }))).toBe('BAD_INPUT');
    expect(await code(unpackCards({ userId: U, gameId: G, cardIndex: 1, foil: false, qty: 1.5 }))).toBe('BAD_INPUT');
    expect(await code(unpackCards({ userId: U, gameId: 'nope', cardIndex: 1, foil: false, qty: 1 }))).toBe('NOT_FOUND');
    expect(await code(unpackCards({ userId: U, gameId: G, cardIndex: 9, foil: false, qty: 1 }))).toBe('NOT_FOUND');
  });

  it('two unpacks racing for one card: only one destroys it', async () => {
    db.cards.set(key(U, G, 0, false), 1);
    const r = await Promise.all([
      code(unpackCards({ userId: U, gameId: G, cardIndex: 0, foil: false, qty: 1 })),
      code(unpackCards({ userId: U, gameId: G, cardIndex: 0, foil: false, qty: 1 })),
    ]);
    expect(r.filter((x) => x === null)).toHaveLength(1);
    expect(await getGems(U)).toBe(GEMS_PER_CARD);
  });
});

describe('openPack', () => {
  const fixed = (...v: number[]) => { let i = 0; return (max: number) => v[i++ % v.length] % max; };

  it('spends exactly a pack of gems and credits the drawn cards', async () => {
    db.gems.set(U, 150);
    const before = [...db.cards.values()].reduce((n, c) => n + c, 0);
    const r = await openPack({ userId: U, gameId: G, rng: fixed(0, 7, 0, 7, 3, 7) });
    expect(r.cards).toHaveLength(PACK_SIZE);
    expect(await getGems(U)).toBe(150 - PACK_COST);
    expect([...db.cards.values()].reduce((n, c) => n + c, 0)).toBe(before + PACK_SIZE);
    expect(held(0)).toBe(2);
    expect(held(3)).toBe(1);
    expect(db.entries.at(-1)).toEqual({ userId: U, delta: -PACK_COST, reason: 'pack' });
  });

  it('refuses without enough gems and changes nothing', async () => {
    db.gems.set(U, PACK_COST - 1);
    const before = new Map(db.cards);
    expect(await code(openPack({ userId: U, gameId: G }))).toBe('INSUFFICIENT_GEMS');
    expect(db.cards).toEqual(before);
    expect(await getGems(U)).toBe(PACK_COST - 1);
  });

  it('two packs racing for one pack’s gems: exactly one opens', async () => {
    db.gems.set(U, PACK_COST);
    const r = await Promise.all([code(openPack({ userId: U, gameId: G })), code(openPack({ userId: U, gameId: G }))]);
    expect(r.filter((x) => x === null)).toHaveLength(1);
    expect(await getGems(U)).toBe(0);
  });

  it('only draws cards of the chosen title, from the real RNG too', async () => {
    db.gems.set(U, PACK_COST * 5);
    for (let i = 0; i < 5; i++) await openPack({ userId: U, gameId: 'laundry-sort' });
    const foreign = [...db.cards.keys()].filter((k) => k.startsWith(`${U}|laundry-sort|`));
    expect(foreign.length).toBeGreaterThan(0);
    expect([...db.cards.keys()].every((k) => k.split('|')[1] === G || k.split('|')[1] === 'laundry-sort')).toBe(true);
  });

  it('rejects an unknown title', async () => {
    db.gems.set(U, PACK_COST);
    expect(await code(openPack({ userId: U, gameId: 'nope' }))).toBe('NOT_FOUND');
    expect(await getGems(U)).toBe(PACK_COST);
  });
});

describe('buyGems', () => {
  it('burns coins one for one and credits the gems, with an entry', async () => {
    const r = await buyGems({ userId: U, units: 2 });
    expect(r).toEqual({ gems: 200, coins: 200 });
    expect(db.coins.get(U)).toBe(800);
    expect(db.burned).toBe(200);
    expect(await getGems(U)).toBe(200);
    expect(db.entries).toEqual([{ userId: U, delta: 200, reason: 'buy' }]);
  });

  it('with too few coins, neither side changes', async () => {
    db.coins.set(U, 50);
    expect(await code(buyGems({ userId: U, units: 1 }))).toBe('INSUFFICIENT_COINS');
    expect(db.coins.get(U)).toBe(50);
    expect(await getGems(U)).toBe(0);
    expect(db.entries).toHaveLength(0);
  });

  it('validates the number of units', async () => {
    expect(await code(buyGems({ userId: U, units: 0 }))).toBe('BAD_INPUT');
    expect(await code(buyGems({ userId: U, units: 11 }))).toBe('BAD_INPUT');
  });
});

describe('the ledger explains the balance', () => {
  it('after a mix of every movement, entries sum to the gems held', async () => {
    await buyGems({ userId: U, units: 1 });
    await unpackCards({ userId: U, gameId: G, cardIndex: 1, foil: false, qty: 3 });
    await openPack({ userId: U, gameId: G });
    expect(sumEntries()).toBe(await getGems(U));
    expect(await getGems(U)).toBe(100 + 30 - PACK_COST);
  });
});
