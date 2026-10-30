import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The card market against an in-memory database. The fake models the guarantees the
 * code leans on: a conditional `updateMany` is one atomic step (the single-sale claim),
 * a transaction either commits whole or rolls back whole, and transactions on one
 * connection pool are serialised by the advisory lock. Coins go through a fake ledger
 * that records every movement, so conservation can be checked by summing it.
 */

type Listing = {
  id: string;
  sellerId: string;
  gameId: string;
  cardIndex: number;
  foil: boolean;
  priceCoins: number;
  status: 'ACTIVE' | 'SOLD' | 'CANCELED';
  buyerId: string | null;
  createdAt: Date;
  closedAt: Date | null;
};

const db = vi.hoisted(() => ({
  cards: new Map<string, number>(),
  listings: new Map<string, Listing>(),
  users: new Map<string, { createdAt: Date; xp: number }>(),
  balances: new Map<string, number>(),
  ledger: [] as { from: string; to: string; amount: number; fee: number }[],
  seq: 0,
}));

const key = (u: string, g: string, i: number, f: boolean) => `${u}|${g}|${i}|${f}`;

function snapshot() {
  return {
    cards: new Map(db.cards),
    listings: new Map([...db.listings].map(([k, v]) => [k, { ...v }])),
    balances: new Map(db.balances),
    ledger: [...db.ledger],
  };
}

const prismaMock = vi.hoisted(() => {
  const m: Record<string, unknown> = {
    user: {
      findUnique: async ({ where }: { where: { id: string } }) => db.users.get(where.id) ?? null,
    },
    userProfile: {
      findUnique: async ({ where }: { where: { userId: string } }) => {
        const u = db.users.get(where.userId);
        return u ? { xp: u.xp } : null;
      },
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
      upsert: async ({ where }: { where: { userId_gameId_cardIndex_foil: { userId: string; gameId: string; cardIndex: number; foil: boolean } } }) => {
        const w = where.userId_gameId_cardIndex_foil;
        const k = key(w.userId, w.gameId, w.cardIndex, w.foil);
        db.cards.set(k, (db.cards.get(k) ?? 0) + 1);
      },
    },
    cardListing: {
      count: async ({ where }: { where: { sellerId: string; status: string } }) =>
        [...db.listings.values()].filter((l) => l.sellerId === where.sellerId && l.status === where.status).length,
      findMany: async ({ where }: { where: Partial<Listing> & { closedAt?: unknown } }) =>
        [...db.listings.values()].filter(
          (l) =>
            (where.gameId === undefined || l.gameId === where.gameId) &&
            (where.cardIndex === undefined || l.cardIndex === where.cardIndex) &&
            (where.foil === undefined || l.foil === where.foil) &&
            (where.status === undefined || l.status === where.status) &&
            (where.sellerId === undefined || l.sellerId === where.sellerId),
        ),
      findUnique: async ({ where }: { where: { id: string } }) => db.listings.get(where.id) ?? null,
      create: async ({ data }: { data: Omit<Listing, 'id' | 'status' | 'buyerId' | 'createdAt' | 'closedAt'> }) => {
        const l: Listing = { ...data, id: `L${++db.seq}`, status: 'ACTIVE', buyerId: null, createdAt: new Date(), closedAt: null };
        db.listings.set(l.id, l);
        return l;
      },
      updateMany: async ({ where, data }: { where: { id: string; status: string; sellerId?: string }; data: Partial<Listing> }) => {
        const l = db.listings.get(where.id);
        if (!l || l.status !== where.status || (where.sellerId && l.sellerId !== where.sellerId)) return { count: 0 };
        Object.assign(l, data);
        return { count: 1 };
      },
    },
    $executeRaw: async () => 0,
  };
  // Serialised, with rollback: restore the snapshot if the callback throws.
  let chain: Promise<unknown> = Promise.resolve();
  m.$transaction = (fn: (tx: unknown) => Promise<unknown>) => {
    const run = async () => {
      const before = snapshot();
      try {
        return await fn(m);
      } catch (e) {
        db.cards = before.cards;
        db.listings = before.listings;
        db.balances = before.balances;
        db.ledger = before.ledger;
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
vi.mock('@/lib/economy/ledger.server', async () => {
  const actual = await vi.importActual<typeof import('@/lib/economy/ledger-core')>(
    '@/lib/economy/ledger-core',
  );
  return {
    InsufficientFundsError: actual.InsufficientFundsError,
    transferCoins: async (
      from: string,
      to: string,
      amount: number,
      opts: { fee?: number; type?: string },
    ) => {
      const fee = opts.fee ?? 0;
      if ((db.balances.get(from) ?? 0) < amount) throw new actual.InsufficientFundsError(from, amount);
      db.balances.set(from, (db.balances.get(from) ?? 0) - amount);
      db.balances.set(to, (db.balances.get(to) ?? 0) + amount - fee);
      db.ledger.push({ from, to, amount, fee });
      return { applied: true, replayed: false, id: 'x' };
    },
  };
});

import { buyCard, cancelCard, listCard, MarketError } from '@/lib/cards/market.server';

const SELLER = 'seller';
const BUYER = 'buyer';
const G = 'altair';
const OLD = new Date(Date.now() - 30 * 86_400_000);
const input = (over: Partial<Parameters<typeof listCard>[0]> = {}) => ({
  sellerId: SELLER,
  gameId: G,
  cardIndex: 2,
  foil: false,
  priceCoins: 100,
  ...over,
});
const stack = (u: string, i = 2, f = false) => db.cards.get(key(u, G, i, f)) ?? 0;
const totalCoins = () => [...db.balances.values()].reduce((n, b) => n + b, 0);

beforeEach(() => {
  db.cards.clear();
  db.listings.clear();
  db.users.clear();
  db.balances.clear();
  db.ledger.length = 0;
  db.seq = 0;
  db.users.set(SELLER, { createdAt: OLD, xp: 100 * 9 }); // level 3
  db.users.set(BUYER, { createdAt: OLD, xp: 0 });
  db.balances.set(SELLER, 0);
  db.balances.set(BUYER, 1000);
  db.cards.set(key(SELLER, G, 2, false), 2);
});

const code = (p: Promise<unknown>) =>
  p.then(
    () => null,
    (e) => (e instanceof MarketError ? e.code : `other:${(e as Error).message}`),
  );

describe('listCard', () => {
  it('moves one card from the stack into escrow', async () => {
    const l = await listCard(input());
    expect(l.status).toBe('ACTIVE');
    expect(stack(SELLER)).toBe(1);
  });

  it('removes a stack that hits zero rather than leaving a zero row', async () => {
    db.cards.set(key(SELLER, G, 2, false), 1);
    await listCard(input());
    expect(db.cards.has(key(SELLER, G, 2, false))).toBe(false);
  });

  it('refuses a card the seller does not hold, and a foil when only normal is held', async () => {
    expect(await code(listCard(input({ cardIndex: 4 })))).toBe('NOT_OWNED');
    expect(await code(listCard(input({ foil: true })))).toBe('NOT_OWNED');
  });

  it('cannot list the same single card twice (escrow)', async () => {
    db.cards.set(key(SELLER, G, 2, false), 1);
    const results = await Promise.all([code(listCard(input())), code(listCard(input()))]);
    expect(results.filter((r) => r === null)).toHaveLength(1);
    expect(results).toContain('NOT_OWNED');
    expect(db.listings.size).toBe(1);
  });

  it('enforces the seller gates', async () => {
    db.users.set(SELLER, { createdAt: new Date(), xp: 100 * 9 });
    expect(await code(listCard(input()))).toBe('ACCOUNT_TOO_NEW');
    db.users.set(SELLER, { createdAt: OLD, xp: 0 });
    expect(await code(listCard(input()))).toBe('LEVEL_TOO_LOW');
  });

  it('enforces price bounds and an unknown title or card', async () => {
    expect(await code(listCard(input({ priceCoins: 9 })))).toBe('BAD_PRICE');
    expect(await code(listCard(input({ priceCoins: 5001 })))).toBe('BAD_PRICE');
    expect(await code(listCard(input({ gameId: 'nope' })))).toBe('NOT_TRADABLE');
    expect(await code(listCard(input({ cardIndex: 9 })))).toBe('NOT_TRADABLE');
  });
});

describe('buyCard', () => {
  async function listed(price = 100) {
    return listCard(input({ priceCoins: price }));
  }

  it('pays the seller 90%, burns 10%, and hands over the card', async () => {
    const l = await listed(100);
    const before = totalCoins();
    const r = await buyCard({ buyerId: BUYER, listingId: l.id });
    expect(r).toMatchObject({ price: 100, fee: 10, proceeds: 90 });
    expect(db.balances.get(BUYER)).toBe(900);
    expect(db.balances.get(SELLER)).toBe(90);
    // Supply shrinks by exactly the burned fee, never by more.
    expect(totalCoins()).toBe(before - 10);
    expect(stack(BUYER)).toBe(1);
    expect(db.listings.get(l.id)).toMatchObject({ status: 'SOLD', buyerId: BUYER });
  });

  it('a card is never duplicated: one card in escrow becomes one card held', async () => {
    const held = stack(SELLER);
    const l = await listed();
    await buyCard({ buyerId: BUYER, listingId: l.id });
    expect(stack(SELLER) + stack(BUYER)).toBe(held);
  });

  it('two buyers racing for one listing: exactly one pays and gets it', async () => {
    db.users.set('buyer2', { createdAt: OLD, xp: 0 });
    db.balances.set('buyer2', 1000);
    const l = await listed();
    const results = await Promise.all([
      code(buyCard({ buyerId: BUYER, listingId: l.id })),
      code(buyCard({ buyerId: 'buyer2', listingId: l.id })),
    ]);
    expect(results.filter((r) => r === null)).toHaveLength(1);
    expect(results).toContain('NOT_AVAILABLE');
    expect(db.ledger).toHaveLength(1);
    expect(stack(BUYER) + stack('buyer2')).toBe(1);
  });

  it('rolls everything back when the buyer cannot pay', async () => {
    db.balances.set(BUYER, 50);
    const l = await listed(100);
    expect(await code(buyCard({ buyerId: BUYER, listingId: l.id }))).toBe('INSUFFICIENT_COINS');
    expect(db.listings.get(l.id)?.status).toBe('ACTIVE');
    expect(stack(BUYER)).toBe(0);
    expect(db.ledger).toHaveLength(0);
    expect(db.balances.get(BUYER)).toBe(50);
  });

  it('refuses to buy your own listing, a sold listing, and an unknown one', async () => {
    const l = await listed();
    expect(await code(buyCard({ buyerId: SELLER, listingId: l.id }))).toBe('SELF_BUY');
    await buyCard({ buyerId: BUYER, listingId: l.id });
    expect(await code(buyCard({ buyerId: BUYER, listingId: l.id }))).toBe('NOT_AVAILABLE');
    expect(await code(buyCard({ buyerId: BUYER, listingId: 'zzz' }))).toBe('NOT_FOUND');
  });
});

describe('cancelCard', () => {
  it('returns the card from escrow', async () => {
    const l = await listCard(input());
    await cancelCard({ sellerId: SELLER, listingId: l.id });
    expect(stack(SELLER)).toBe(2);
    expect(db.listings.get(l.id)?.status).toBe('CANCELED');
  });

  it('only the seller can cancel, and only while active', async () => {
    const l = await listCard(input());
    expect(await code(cancelCard({ sellerId: BUYER, listingId: l.id }))).toBe('NOT_AVAILABLE');
    await cancelCard({ sellerId: SELLER, listingId: l.id });
    expect(await code(cancelCard({ sellerId: SELLER, listingId: l.id }))).toBe('NOT_AVAILABLE');
    expect(stack(SELLER)).toBe(2);
  });

  it('a cancel racing a buy: the card ends up in exactly one place', async () => {
    const l = await listCard(input());
    await Promise.all([
      code(cancelCard({ sellerId: SELLER, listingId: l.id })),
      code(buyCard({ buyerId: BUYER, listingId: l.id })),
    ]);
    expect(stack(SELLER) + stack(BUYER)).toBe(2);
    const sold = db.listings.get(l.id)?.status === 'SOLD';
    expect(db.ledger).toHaveLength(sold ? 1 : 0);
  });
});
