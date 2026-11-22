/**
 * The shared core of the one Listing model: every claim and close is scoped to
 * its kind (a card listing id cannot be bought through the cosmetics market),
 * the claim is the conditional ACTIVE → SOLD update that makes a listing sell
 * once, and the cross-domain reads only ever see their own kind.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const listing = {
  updateMany: vi.fn(),
  findFirst: vi.fn(),
  groupBy: vi.fn(),
  count: vi.fn(),
  deleteMany: vi.fn(),
  findMany: vi.fn(),
};
vi.mock('@/lib/prisma.server', () => ({ prisma: { listing } }));

const core = await import('@/lib/listings/listings.server');

beforeEach(() => vi.clearAllMocks());

describe('claimListing', () => {
  it('is a conditional ACTIVE → SOLD update scoped to the kind', async () => {
    listing.updateMany.mockResolvedValueOnce({ count: 1 });
    const won = await core.claimListing({ listing } as never, { id: 'l1', kind: 'CARD', buyerId: 'b' });
    expect(won).toBe(true);
    const arg = listing.updateMany.mock.calls[0]![0];
    expect(arg.where).toEqual({ id: 'l1', kind: 'CARD', status: 'ACTIVE' });
    expect(arg.data).toMatchObject({ status: 'SOLD', buyerId: 'b' });
    expect(arg.data.closedAt).toBeInstanceOf(Date);
  });

  it('reports a lost race (count 0) as not won', async () => {
    listing.updateMany.mockResolvedValueOnce({ count: 0 });
    expect(await core.claimListing({ listing } as never, { id: 'l1', kind: 'COSMETIC', buyerId: 'b' })).toBe(false);
  });
});

describe('closeListing', () => {
  it('CASes to CANCELED under the caller conditions plus the kind', async () => {
    listing.updateMany.mockResolvedValueOnce({ count: 1 });
    const won = await core.closeListing({ listing } as never, 'COSMETIC', {
      id: 'l1',
      sellerId: 's',
      status: { in: ['ACTIVE', 'HELD'] },
    });
    expect(won).toBe(true);
    expect(listing.updateMany.mock.calls[0]![0].where).toEqual({
      id: 'l1',
      sellerId: 's',
      status: { in: ['ACTIVE', 'HELD'] },
      kind: 'COSMETIC',
    });
    expect(listing.updateMany.mock.calls[0]![0].data.status).toBe('CANCELED');
  });
});

describe('cross-domain reads see only their kind', () => {
  it('lowestCosmeticPrice', async () => {
    listing.findFirst.mockResolvedValueOnce({ priceCoins: 42 });
    expect(await core.lowestCosmeticPrice('color.sunset', { excludeId: 'x' })).toBe(42);
    expect(listing.findFirst.mock.calls[0]![0].where).toEqual({
      kind: 'COSMETIC',
      itemId: 'color.sunset',
      status: 'ACTIVE',
      id: { not: 'x' },
    });
    listing.findFirst.mockResolvedValueOnce(null);
    expect(await core.lowestCosmeticPrice('color.sunset')).toBeNull();
  });

  it('lowestCosmeticPrices', async () => {
    listing.groupBy.mockResolvedValueOnce([
      { itemId: 'a', _min: { priceCoins: 10 } },
      { itemId: 'b', _min: { priceCoins: null } },
    ]);
    const m = await core.lowestCosmeticPrices(['a', 'b']);
    expect([...m]).toEqual([['a', 10]]);
    expect(listing.groupBy.mock.calls[0]![0].where.kind).toBe('COSMETIC');
    expect(await core.lowestCosmeticPrices([])).toEqual(new Map());
  });

  it('counts, erasure and export', async () => {
    listing.count.mockResolvedValue(3);
    await core.countHeldCosmetics();
    await core.countActiveCards('g1', 'viewer');
    expect(listing.count.mock.calls[0]![0].where).toEqual({ kind: 'COSMETIC', status: 'HELD' });
    expect(listing.count.mock.calls[1]![0].where).toEqual({
      kind: 'CARD',
      gameId: 'g1',
      status: 'ACTIVE',
      sellerId: { not: 'viewer' },
    });
    core.deleteActiveCardListingsOf('u1');
    expect(listing.deleteMany.mock.calls[0]![0].where).toEqual({ kind: 'CARD', sellerId: 'u1', status: 'ACTIVE' });
    listing.findMany.mockResolvedValueOnce([]);
    await core.cardListingsForExport('u1', 10);
    expect(listing.findMany.mock.calls[0]![0].where).toEqual({
      kind: 'CARD',
      OR: [{ sellerId: 'u1' }, { buyerId: 'u1' }],
    });
  });

  it('narrows kind columns and refuses a row of another kind', () => {
    expect(core.cosmeticFields({ itemId: 'a', inventoryId: 'i' })).toEqual({ itemId: 'a', inventoryId: 'i' });
    expect(() => core.cosmeticFields({ itemId: null, inventoryId: null })).toThrow();
    expect(core.cardFields({ gameId: 'g', cardIndex: 0, foil: true })).toEqual({
      gameId: 'g',
      cardIndex: 0,
      foil: true,
    });
    expect(() => core.cardFields({ gameId: null, cardIndex: null, foil: false })).toThrow();
  });
});
