/**
 * Storefront sales on the PRODUCT kind of Listing: the money moves exactly as
 * it did over StorefrontProduct (one transfer, 10% burned, typed PURCHASE with
 * entity `storefront` / the product id, the same note), the purchase record is
 * written once per buyer, and a taken-down product does not sell.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

class InsufficientFundsError extends Error {}
const transferCoins = vi.fn();
vi.mock('@/lib/economy/ledger.server', () => ({ transferCoins, InsufficientFundsError }));

interface Row {
  id: string;
  kind: string;
  sellerId: string;
  priceCoins: number;
  status: string;
  deliverable: string | null;
  salesCount: number;
}
const state = {
  listings: new Map<string, Row>(),
  purchases: [] as { listingId: string; buyerId: string; pricePaid: number }[],
  coins: new Map<string, number>(),
};

const tx = {
  listing: {
    findUnique: vi.fn(async ({ where }: { where: { id: string; kind?: string } }) => {
      const r = state.listings.get(where.id);
      return r && (!where.kind || r.kind === where.kind) ? { ...r } : null;
    }),
    update: vi.fn(async ({ where, data }: { where: { id: string }; data: { salesCount?: { increment: number } } }) => {
      const r = state.listings.get(where.id)!;
      if (data.salesCount) r.salesCount += data.salesCount.increment;
      return { ...r };
    }),
  },
  listingPurchase: {
    findUnique: vi.fn(
      async ({ where }: { where: { listingId_buyerId: { listingId: string; buyerId: string } } }) =>
        state.purchases.find(
          (p) => p.listingId === where.listingId_buyerId.listingId && p.buyerId === where.listingId_buyerId.buyerId,
        ) ?? null,
    ),
    create: vi.fn(async ({ data }: { data: { listingId: string; buyerId: string; pricePaid: number } }) => {
      state.purchases.push(data);
      return data;
    }),
  },
  userProfile: {
    upsert: vi.fn(async () => ({})),
    findUnique: vi.fn(async ({ where }: { where: { userId: string } }) => ({
      coins: BigInt(state.coins.get(where.userId) ?? 0),
    })),
  },
};

vi.mock('@/lib/prisma.server', () => ({
  prisma: { $transaction: (fn: (t: typeof tx) => Promise<unknown>) => fn(tx) },
}));

const { buyProduct, StorefrontError } = await import('@/lib/listings/product.server');

beforeEach(() => {
  vi.clearAllMocks();
  state.listings.clear();
  state.purchases = [];
  state.coins = new Map([
    ['buyer', 500],
    ['creator', 0],
  ]);
  state.listings.set('prod-1', {
    id: 'prod-1',
    kind: 'PRODUCT',
    sellerId: 'creator',
    priceCoins: 55,
    status: 'ACTIVE',
    deliverable: 'https://example.test/dl',
    salesCount: 3,
  });
  transferCoins.mockImplementation(async (from: string, to: string, amount: number, opts: { fee?: number }) => {
    const fee = opts.fee ?? 0;
    if ((state.coins.get(from) ?? 0) < amount) throw new InsufficientFundsError('short');
    state.coins.set(from, (state.coins.get(from) ?? 0) - amount);
    state.coins.set(to, (state.coins.get(to) ?? 0) + amount - fee);
  });
});

describe('buyProduct (PRODUCT listings)', () => {
  it('moves the coins with the same ledger call the storefront always made', async () => {
    const res = await buyProduct('prod-1', 'buyer');
    expect(transferCoins).toHaveBeenCalledTimes(1);
    expect(transferCoins).toHaveBeenCalledWith('buyer', 'creator', 55, {
      tx,
      fee: 5, // floor(10%)
      type: 'PURCHASE',
      entityType: 'storefront',
      entityId: 'prod-1',
      note: 'Storefront sale',
    });
    expect(res).toEqual({ deliverable: 'https://example.test/dl', balance: 445, creatorId: 'creator' });
    expect(state.coins.get('creator')).toBe(50);
    expect(state.purchases).toEqual([{ listingId: 'prod-1', buyerId: 'buyer', pricePaid: 55 }]);
    expect(state.listings.get('prod-1')!.salesCount).toBe(4);
  });

  it('only looks the product up as a PRODUCT listing', async () => {
    await buyProduct('prod-1', 'buyer');
    expect(tx.listing.findUnique.mock.calls[0]![0]).toMatchObject({
      where: { id: 'prod-1', kind: 'PRODUCT' },
    });
    state.listings.set('card-1', { ...state.listings.get('prod-1')!, id: 'card-1', kind: 'CARD' });
    await expect(buyProduct('card-1', 'buyer')).rejects.toThrow('UNAVAILABLE');
  });

  it('refuses a second purchase by the same buyer without moving coins', async () => {
    await buyProduct('prod-1', 'buyer');
    transferCoins.mockClear();
    await expect(buyProduct('prod-1', 'buyer')).rejects.toThrow('ALREADY_OWNED');
    expect(transferCoins).not.toHaveBeenCalled();
  });

  it('does not sell a taken-down (CANCELED) product, or to its creator', async () => {
    state.listings.get('prod-1')!.status = 'CANCELED';
    await expect(buyProduct('prod-1', 'buyer')).rejects.toBeInstanceOf(StorefrontError);
    state.listings.get('prod-1')!.status = 'ACTIVE';
    await expect(buyProduct('prod-1', 'creator')).rejects.toThrow('OWN_PRODUCT');
    expect(transferCoins).not.toHaveBeenCalled();
  });

  it('maps an overdraft to INSUFFICIENT_COINS and records no purchase', async () => {
    state.coins.set('buyer', 10);
    await expect(buyProduct('prod-1', 'buyer')).rejects.toThrow('INSUFFICIENT_COINS');
    expect(state.purchases).toEqual([]);
  });
});
