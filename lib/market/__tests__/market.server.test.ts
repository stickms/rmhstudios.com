/* eslint-disable @typescript-eslint/no-explicit-any -- a stateful Prisma/tx mock is untyped by nature; `any` keeps the mock terse. */
import { describe, it, expect, beforeEach, vi } from 'vitest';

// ── Isolate the module chain ────────────────────────────────────────────────
// market.server pulls in the admin-review notifier (→ notifications/push/redis).
// Stub it so tests don't load that chain and so we can assert the HELD path.
const notifyAdminsOfReview = vi.fn().mockResolvedValue(undefined);
vi.mock('@/lib/admin-review.server', () => ({ notifyAdminsOfReview }));
// getCreatorEarnings (imported in test e) transitively pulls these in; stub them
// so the test doesn't load the push/redis chain and stays isolated.
vi.mock('@/lib/notifications.server', () => ({ createNotification: vi.fn() }));
vi.mock('@/lib/admin-audit.server', () => ({ logAdminAction: vi.fn() }));

// ── Stateful, rollback-aware Prisma mock ────────────────────────────────────
// Models the two invariants under test: the conditional `updateMany where
// status:ACTIVE` claim guard (READ COMMITTED idiom) and transactional atomicity
// (a throw inside `$transaction` rolls every mutation back).

interface ListingRow {
  id: string;
  sellerId: string;
  inventoryId: string;
  itemId: string;
  priceCoins: number;
  status: 'ACTIVE' | 'SOLD' | 'CANCELED' | 'HELD';
  buyerId: string | null;
  createdAt: Date;
  closedAt: Date | null;
}
interface InvRow {
  id: string;
  userId: string;
  itemId: string;
  equipped: boolean;
  acquiredAt: Date;
}
interface State {
  listings: Map<string, ListingRow>;
  inventory: Map<string, InvRow>;
  profiles: Map<string, { coins: number; xp: number }>;
  users: Map<string, { id: string; createdAt: Date }>;
  ledger: Array<{ senderId: string | null; recipientId: string; amount: number; type: string; entityType: string | null; entityId: string | null; note: string | null }>;
  seq: number;
}

const store: { state: State } = { state: emptyState() };

function emptyState(): State {
  return {
    listings: new Map(),
    inventory: new Map(),
    profiles: new Map(),
    users: new Map(),
    ledger: [],
    seq: 0,
  };
}

const db: any = {
  $transaction: async <T>(fn: (tx: any) => Promise<T>): Promise<T> => {
    const snapshot = structuredClone(store.state);
    try {
      return await fn(db);
    } catch (e) {
      store.state = snapshot; // roll back every mutation
      throw e;
    }
  },
  marketListing: {
    findUnique: async ({ where }: any) => {
      const s = store.state;
      if (where.id) return clone(s.listings.get(where.id));
      if (where.inventoryId) {
        for (const l of s.listings.values()) if (l.inventoryId === where.inventoryId) return clone(l);
      }
      return null;
    },
    findMany: async ({ where }: any) => {
      const s = store.state;
      const rows: ListingRow[] = [];
      for (const l of s.listings.values()) {
        if (where.itemId && l.itemId !== where.itemId) continue;
        if (where.status && l.status !== where.status) continue;
        if (where.closedAt?.gte && (!l.closedAt || l.closedAt < where.closedAt.gte)) continue;
        rows.push(l);
      }
      return rows.map((l) => ({ priceCoins: l.priceCoins }));
    },
    updateMany: async ({ where, data }: any) => {
      const s = store.state;
      const l = where.id ? s.listings.get(where.id) : undefined;
      if (!l) return { count: 0 };
      if (where.status && l.status !== where.status) return { count: 0 };
      if (where.sellerId && l.sellerId !== where.sellerId) return { count: 0 };
      if (data.status) l.status = data.status;
      if ('buyerId' in data) l.buyerId = data.buyerId;
      if ('closedAt' in data) l.closedAt = data.closedAt;
      return { count: 1 };
    },
    count: async ({ where }: any) => {
      const s = store.state;
      let n = 0;
      for (const l of s.listings.values()) {
        if (where.sellerId && l.sellerId !== where.sellerId) continue;
        if (where.status && l.status !== where.status) continue;
        n++;
      }
      return n;
    },
    create: async ({ data }: any) => {
      const s = store.state;
      const id = data.id ?? `L${++s.seq}`;
      const row: ListingRow = {
        id,
        sellerId: data.sellerId,
        inventoryId: data.inventoryId,
        itemId: data.itemId,
        priceCoins: data.priceCoins,
        status: data.status ?? 'ACTIVE',
        buyerId: data.buyerId ?? null,
        createdAt: data.createdAt ?? new Date(),
        closedAt: data.closedAt ?? null,
      };
      s.listings.set(id, row);
      return clone(row);
    },
    update: async ({ where, data }: any) => {
      const s = store.state;
      let row: ListingRow | undefined;
      if (where.id) row = s.listings.get(where.id);
      else if (where.inventoryId) for (const l of s.listings.values()) if (l.inventoryId === where.inventoryId) row = l;
      if (!row) throw new Error('listing not found');
      Object.assign(row, data);
      return clone(row);
    },
  },
  userInventory: {
    findUnique: async ({ where }: any) => {
      const s = store.state;
      if (where.userId_itemId) {
        const { userId, itemId } = where.userId_itemId;
        for (const inv of s.inventory.values()) if (inv.userId === userId && inv.itemId === itemId) return clone(inv);
        return null;
      }
      if (where.id) return clone(s.inventory.get(where.id));
      return null;
    },
    update: async ({ where, data }: any) => {
      const s = store.state;
      const inv = s.inventory.get(where.id);
      if (!inv) throw new Error('inventory not found');
      Object.assign(inv, data);
      return clone(inv);
    },
  },
  userProfile: {
    findUnique: async ({ where }: any) => clone(store.state.profiles.get(where.userId)) ?? null,
    upsert: async ({ where, create, update }: any) => {
      const s = store.state;
      const existing = s.profiles.get(where.userId);
      if (existing) {
        if (update?.coins?.increment) existing.coins += update.coins.increment;
        return clone(existing);
      }
      const row = { coins: create.coins ?? 10, xp: create.xp ?? 0 };
      s.profiles.set(where.userId, row);
      return clone(row);
    },
    updateMany: async ({ where, data }: any) => {
      const s = store.state;
      const p = s.profiles.get(where.userId);
      if (!p) return { count: 0 };
      if (where.coins?.gte !== undefined && p.coins < where.coins.gte) return { count: 0 };
      if (data.coins?.decrement) p.coins -= data.coins.decrement;
      if (data.coins?.increment) p.coins += data.coins.increment;
      return { count: 1 };
    },
  },
  user: {
    findUnique: async ({ where }: any) => clone(store.state.users.get(where.id)) ?? null,
  },
  coinTransaction: {
    create: async ({ data }: any) => {
      store.state.ledger.push({
        senderId: data.senderId ?? null,
        recipientId: data.recipientId,
        amount: data.amount,
        type: data.type,
        entityType: data.entityType ?? null,
        entityId: data.entityId ?? null,
        note: data.note ?? null,
      });
      return { id: `T${++store.state.seq}`, ...data };
    },
  },
};

function clone<T>(v: T): T {
  return v == null ? v : structuredClone(v);
}

vi.mock('@/lib/prisma.server', () => ({ prisma: db }));

// Import AFTER the mocks are registered.
const {
  listItem,
  buyListing,
  cancelListing,
} = await import('@/lib/market/market.server');
const {
  isTradable,
  marketFee,
  median,
  isAnomalousPrice,
  isPriceInBounds,
  minPriceFor,
  MARKET_FEE_BPS,
} = await import('@/lib/market/tradable');

// ── Fixtures ────────────────────────────────────────────────────────────────
const OLD = new Date(Date.now() - 30 * 24 * 3600 * 1000); // 30 days old account
const TRADABLE_ITEM = 'frame.gold'; // AVATAR_FRAME, no tier gate → tradable
const SELLER = 'seller-1';
const BUYER = 'buyer-1';

function seedTradeable(price = 1000) {
  store.state = emptyState();
  const s = store.state;
  s.users.set(SELLER, { id: SELLER, createdAt: OLD });
  s.users.set(BUYER, { id: BUYER, createdAt: OLD });
  s.profiles.set(SELLER, { coins: 10, xp: 100_000 }); // high level
  s.profiles.set(BUYER, { coins: 5000, xp: 100_000 });
  s.inventory.set('inv-1', { id: 'inv-1', userId: SELLER, itemId: TRADABLE_ITEM, equipped: false, acquiredAt: OLD });
  s.listings.set('L1', {
    id: 'L1',
    sellerId: SELLER,
    inventoryId: 'inv-1',
    itemId: TRADABLE_ITEM,
    priceCoins: price,
    status: 'ACTIVE',
    buyerId: null,
    createdAt: new Date(),
    closedAt: null,
  });
}

beforeEach(() => {
  store.state = emptyState();
  notifyAdminsOfReview.mockClear();
});

// ── Pure guards ──────────────────────────────────────────────────────────────
describe('tradable guards', () => {
  it('allows cosmetic frames/colors/badges/flair, denies themes/pets/tier-gated/unknown', () => {
    expect(isTradable('frame.gold')).toBe(true); // AVATAR_FRAME
    expect(isTradable('color.sunset')).toBe(true); // NAME_COLOR
    expect(isTradable('badge.star')).toBe(true); // BADGE
    expect(isTradable('flair.accent')).toBe(true); // POST_FLAIR
    expect(isTradable('theme.vapor')).toBe(false); // THEME
    expect(isTradable('pet.cat')).toBe(false); // PET
    expect(isTradable('banner.dusk')).toBe(false); // BANNER
    expect(isTradable('theme.midnight')).toBe(false); // requiresTier pro
    expect(isTradable('does.not.exist')).toBe(false); // not in catalog
  });

  it('fee math splits 90/10 with the fee rounded down and always positive', () => {
    expect(MARKET_FEE_BPS).toBe(1000);
    expect(marketFee(1000)).toEqual({ price: 1000, fee: 100, proceeds: 900 });
    expect(marketFee(10)).toEqual({ price: 10, fee: 1, proceeds: 9 }); // min price
    expect(marketFee(99)).toEqual({ price: 99, fee: 9, proceeds: 90 }); // floor(9.9)=9
    const { fee, proceeds } = marketFee(12345);
    expect(fee + proceeds).toBe(12345); // conserved
  });

  it('price bounds respect the primary-shop floor (25%)', () => {
    // frame.gold shop price is 250 → floor ceil(62.5)=63.
    expect(minPriceFor('frame.gold')).toBe(63);
    expect(isPriceInBounds('frame.gold', 62)).toBe(false);
    expect(isPriceInBounds('frame.gold', 63)).toBe(true);
    expect(isPriceInBounds('frame.gold', 100_001)).toBe(false);
    expect(isPriceInBounds('frame.gold', 100.5)).toBe(false); // non-integer
  });

  it('anomaly detection needs enough samples and a 10x median', () => {
    expect(median([100, 200, 300])).toBe(200);
    expect(isAnomalousPrice(5000, [])).toBe(false); // no history
    expect(isAnomalousPrice(5000, [100, 100])).toBe(false); // < 3 samples
    expect(isAnomalousPrice(5000, [100, 100, 100])).toBe(true); // 5000 ≥ 10×100
    expect(isAnomalousPrice(900, [100, 100, 100])).toBe(false); // 900 < 1000
  });
});

// ── buyListing: the escrow transaction ───────────────────────────────────────
describe('buyListing', () => {
  it('(a) transfers the item and moves coins with the 90/10 split', async () => {
    seedTradeable(1000);
    const res = await buyListing({ buyerId: BUYER, listingId: 'L1' });

    expect(res.status).toBe('SOLD');
    expect(res).toMatchObject({ price: 1000, proceeds: 900, fee: 100 });

    const s = store.state;
    // Coins: buyer −1000, seller +900, 100 burned (credited to nobody).
    expect(s.profiles.get(BUYER)!.coins).toBe(4000);
    expect(s.profiles.get(SELLER)!.coins).toBe(910); // 10 + 900
    // Item re-parented to the buyer, unequipped.
    expect(s.inventory.get('inv-1')!.userId).toBe(BUYER);
    expect(s.inventory.get('inv-1')!.equipped).toBe(false);
    // Listing closed as SOLD to the buyer.
    const l = s.listings.get('L1')!;
    expect(l.status).toBe('SOLD');
    expect(l.buyerId).toBe(BUYER);
    // Ledger: buyer PURCHASE debit (−1000, entityType market) + seller MARKET credit (+900).
    const purchase = s.ledger.find((t) => t.type === 'PURCHASE');
    const marketCredit = s.ledger.find((t) => t.type === 'MARKET');
    expect(purchase).toMatchObject({ recipientId: BUYER, amount: -1000, entityType: 'market' });
    expect(marketCredit).toMatchObject({ recipientId: SELLER, senderId: BUYER, amount: 900, type: 'MARKET' });
    // The burn: total market debits − credits = 100.
    const net = s.ledger.filter((t) => t.entityType === 'market').reduce((a, t) => a + t.amount, 0);
    expect(net).toBe(-100);
  });

  it('(b) rejects insufficient coins with NO state change (rolls back)', async () => {
    seedTradeable(1000);
    store.state.profiles.get(BUYER)!.coins = 500; // not enough
    await expect(buyListing({ buyerId: BUYER, listingId: 'L1' })).rejects.toThrow(/insufficient/i);

    const s = store.state;
    expect(s.profiles.get(BUYER)!.coins).toBe(500); // unchanged
    expect(s.profiles.get(SELLER)!.coins).toBe(10); // unchanged
    expect(s.inventory.get('inv-1')!.userId).toBe(SELLER); // NOT transferred
    expect(s.listings.get('L1')!.status).toBe('ACTIVE'); // claim rolled back
    expect(s.ledger).toHaveLength(0); // no ledger rows
  });

  it('(c1) double-buy: the second buyer fails, item transfers exactly once', async () => {
    seedTradeable(1000);
    const first = await buyListing({ buyerId: BUYER, listingId: 'L1' });
    expect(first.status).toBe('SOLD');

    // A second, different buyer with plenty of coins tries the same listing.
    store.state.users.set('buyer-2', { id: 'buyer-2', createdAt: OLD });
    store.state.profiles.set('buyer-2', { coins: 5000, xp: 100_000 });
    await expect(buyListing({ buyerId: 'buyer-2', listingId: 'L1' })).rejects.toMatchObject({
      name: 'MarketError',
      code: 'NOT_AVAILABLE',
    });

    const s = store.state;
    expect(s.inventory.get('inv-1')!.userId).toBe(BUYER); // still first buyer
    expect(s.profiles.get('buyer-2')!.coins).toBe(5000); // untouched
    expect(s.ledger.filter((t) => t.entityType === 'market')).toHaveLength(2); // exactly one trade
  });

  it('(c2) claim guard: a stale ACTIVE read still loses the conditional update', async () => {
    seedTradeable(1000);
    // Simulate a competitor that claimed the row between our read and our write:
    // findUnique reports ACTIVE (stale) but the real row is already SOLD.
    const realFindUnique = db.marketListing.findUnique;
    db.marketListing.findUnique = (async ({ where }: any) => {
      if (where.id === 'L1') return { ...store.state.listings.get('L1'), status: 'ACTIVE' };
      return realFindUnique({ where });
    }) as any;
    store.state.listings.get('L1')!.status = 'SOLD';

    try {
      await expect(buyListing({ buyerId: BUYER, listingId: 'L1' })).rejects.toMatchObject({
        code: 'NOT_AVAILABLE',
      });
    } finally {
      db.marketListing.findUnique = realFindUnique;
    }
    // No coins moved despite the stale read passing the first guard.
    expect(store.state.ledger).toHaveLength(0);
    expect(store.state.profiles.get(BUYER)!.coins).toBe(5000);
  });

  it('(d) rejects buying your own listing', async () => {
    seedTradeable(1000);
    await expect(buyListing({ buyerId: SELLER, listingId: 'L1' })).rejects.toMatchObject({ code: 'SELF_BUY' });
    expect(store.state.listings.get('L1')!.status).toBe('ACTIVE');
    expect(store.state.ledger).toHaveLength(0);
  });

  it('rejects when the buyer already owns the item (unique inventory)', async () => {
    seedTradeable(1000);
    store.state.inventory.set('inv-b', { id: 'inv-b', userId: BUYER, itemId: TRADABLE_ITEM, equipped: false, acquiredAt: OLD });
    await expect(buyListing({ buyerId: BUYER, listingId: 'L1' })).rejects.toMatchObject({ code: 'ALREADY_OWNED' });
    expect(store.state.inventory.get('inv-1')!.userId).toBe(SELLER);
    expect(store.state.ledger).toHaveLength(0);
  });

  it('freezes an anomalous price (HELD) without moving funds, and notifies admins', async () => {
    seedTradeable(50_000); // 500× the ~100-coin median below
    const s = store.state;
    // Seed 3 recent SOLD sales around 100 coins for the same item.
    for (let i = 0; i < 3; i++) {
      s.listings.set(`sold-${i}`, {
        id: `sold-${i}`,
        sellerId: 'x',
        inventoryId: `soldinv-${i}`,
        itemId: TRADABLE_ITEM,
        priceCoins: 100,
        status: 'SOLD',
        buyerId: 'y',
        createdAt: OLD,
        closedAt: new Date(),
      });
    }
    const res = await buyListing({ buyerId: BUYER, listingId: 'L1' });
    expect(res.status).toBe('HELD');
    expect(s.listings.get('L1')!.status).toBe('HELD');
    expect(s.profiles.get(BUYER)!.coins).toBe(5000); // NOT charged
    expect(s.inventory.get('inv-1')!.userId).toBe(SELLER); // NOT transferred
    expect(s.ledger).toHaveLength(0);
    expect(notifyAdminsOfReview).toHaveBeenCalledTimes(1);
  });
});

// ── listItem / cancelListing ─────────────────────────────────────────────────
describe('listItem', () => {
  function seedSellerOnly() {
    store.state = emptyState();
    const s = store.state;
    s.users.set(SELLER, { id: SELLER, createdAt: OLD });
    s.profiles.set(SELLER, { coins: 10, xp: 100_000 });
    s.inventory.set('inv-1', { id: 'inv-1', userId: SELLER, itemId: TRADABLE_ITEM, equipped: false, acquiredAt: OLD });
  }

  it('creates an ACTIVE listing for an owned, unequipped, tradable item', async () => {
    seedSellerOnly();
    const listing = await listItem({ sellerId: SELLER, itemId: TRADABLE_ITEM, priceCoins: 500 });
    expect(listing.status).toBe('ACTIVE');
    expect(listing.inventoryId).toBe('inv-1');
    expect(listing.priceCoins).toBe(500);
  });

  it('rejects untradable items, equipped items, and below-floor prices', async () => {
    seedSellerOnly();
    await expect(listItem({ sellerId: SELLER, itemId: 'theme.vapor', priceCoins: 500 })).rejects.toMatchObject({ code: 'NOT_TRADABLE' });
    await expect(listItem({ sellerId: SELLER, itemId: TRADABLE_ITEM, priceCoins: 5 })).rejects.toMatchObject({ code: 'BAD_PRICE' });
    await expect(listItem({ sellerId: SELLER, itemId: TRADABLE_ITEM, priceCoins: 62 })).rejects.toMatchObject({ code: 'BELOW_FLOOR' });

    store.state.inventory.get('inv-1')!.equipped = true;
    await expect(listItem({ sellerId: SELLER, itemId: TRADABLE_ITEM, priceCoins: 500 })).rejects.toMatchObject({ code: 'EQUIPPED' });
  });

  it('gates on account age and level', async () => {
    seedSellerOnly();
    store.state.users.get(SELLER)!.createdAt = new Date(); // brand new
    await expect(listItem({ sellerId: SELLER, itemId: TRADABLE_ITEM, priceCoins: 500 })).rejects.toMatchObject({ code: 'ACCOUNT_TOO_NEW' });

    store.state.users.get(SELLER)!.createdAt = OLD;
    store.state.profiles.get(SELLER)!.xp = 0; // level 0
    await expect(listItem({ sellerId: SELLER, itemId: TRADABLE_ITEM, priceCoins: 500 })).rejects.toMatchObject({ code: 'LEVEL_TOO_LOW' });
  });

  it('rejects a second active listing for the same inventory row', async () => {
    seedSellerOnly();
    await listItem({ sellerId: SELLER, itemId: TRADABLE_ITEM, priceCoins: 500 });
    await expect(listItem({ sellerId: SELLER, itemId: TRADABLE_ITEM, priceCoins: 600 })).rejects.toMatchObject({ code: 'ALREADY_LISTED' });
  });
});

describe('cancelListing', () => {
  it('cancels an ACTIVE listing owned by the seller', async () => {
    seedTradeable(1000);
    await cancelListing('L1', SELLER);
    expect(store.state.listings.get('L1')!.status).toBe('CANCELED');
  });

  it('refuses to cancel a listing you do not own', async () => {
    seedTradeable(1000);
    await expect(cancelListing('L1', 'someone-else')).rejects.toMatchObject({ code: 'NOT_AVAILABLE' });
    expect(store.state.listings.get('L1')!.status).toBe('ACTIVE');
  });
});

// ── (e) MARKET proceeds excluded from creator "earned" ──────────────────────
describe('creator earnings exclusion', () => {
  // Faithful fake db for getCreatorEarnings: interprets the exact where-shapes
  // the derivation uses against an in-memory ledger.
  function fakeEarningsDb(txns: Array<{ recipientId: string; amount: number; type: string; entityType?: string | null }>, coins = 0) {
    const sumWhere = (where: any) => {
      let rows = txns.filter((t) => t.recipientId === where.recipientId);
      if (where.amount?.gt !== undefined) rows = rows.filter((t) => t.amount > where.amount.gt);
      if (where.type?.in) rows = rows.filter((t) => where.type.in.includes(t.type));
      else if (typeof where.type === 'string') rows = rows.filter((t) => t.type === where.type);
      if (where.entityType?.in) rows = rows.filter((t) => t.entityType && where.entityType.in.includes(t.entityType));
      return rows.reduce((sum, t) => sum + t.amount, 0);
    };
    return {
      coinTransaction: { aggregate: async ({ where }: any) => ({ _sum: { amount: sumWhere(where) } }) },
      redemptionRequest: { aggregate: async () => ({ _sum: { amountCoins: 0 } }) },
      userProfile: { findUnique: async () => ({ coins }) },
    };
  }

  it('excludes MARKET proceeds while still counting TIP income', async () => {
    const { getCreatorEarnings } = await import('@/lib/creator/earnings.server');
    const db2 = fakeEarningsDb(
      [
        { recipientId: SELLER, amount: 900, type: 'MARKET', entityType: 'market' },
        { recipientId: SELLER, amount: 500, type: 'TIP', entityType: null },
      ],
      9000,
    ) as any;
    const earnings = await getCreatorEarnings(SELLER, db2);
    // TIP counts; the 900-coin MARKET sale does NOT.
    expect(earnings.lifetimeEarned).toBe(500);
  });

  it('a market-only seller has zero redeemable earned coins', async () => {
    const { getCreatorEarnings } = await import('@/lib/creator/earnings.server');
    const db2 = fakeEarningsDb([{ recipientId: SELLER, amount: 5000, type: 'MARKET', entityType: 'market' }], 5000) as any;
    const earnings = await getCreatorEarnings(SELLER, db2);
    expect(earnings.lifetimeEarned).toBe(0);
    expect(earnings.redeemable).toBe(0);
    expect(earnings.spendable).toBe(5000); // spendable, just not redeemable
  });
});
