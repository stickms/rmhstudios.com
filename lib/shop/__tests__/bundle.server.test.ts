import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * Bundle purchase (C3) — one atomic transaction: all three items or none.
 */

const w = await vi.hoisted(async () => {
  const { Table, FakeLedger, makeTransaction } = await import('../../economy/__tests__/fake-db');
  const inventory = new Table({ unique: [['userId', 'itemId']] });
  const ledger = new FakeLedger();
  const prisma: Record<string, unknown> = {
    userInventory: inventory.api,
    userProfile: {
      findUnique: async ({ where }: { where: { userId: string } }) => ({
        coins: ledger.balance(where.userId),
      }),
    },
  };
  prisma.$transaction = makeTransaction([inventory], ledger, () => prisma);
  return { inventory, ledger, prisma };
});

vi.mock('@/lib/prisma.server', () => ({ prisma: w.prisma }));
vi.mock('@/lib/economy/ledger.server', async () => {
  const { FakeInsufficientFundsError } = await import('../../economy/__tests__/fake-db');
  return {
    InsufficientFundsError: FakeInsufficientFundsError,
    debitCoins: (u: string, a: number, o: object) => w.ledger.debit(u, a, o),
  };
});

import { BundleError, purchaseBundle } from '@/lib/shop/daily-shop.server';
import { bundlePrice, dailyFeaturedIds, utcDateKey } from '@/lib/shop/daily-shop';
import { getShopItem } from '@/lib/shop/catalog';

const NOW = new Date('2026-10-12T15:00:00Z');
const featured = dailyFeaturedIds(utcDateKey(NOW));
const pick = featured.slice(2, 5);
const price = bundlePrice(pick.map((id) => getShopItem(id)!.price));

beforeEach(() => {
  w.inventory.reset();
  w.ledger.reset();
  w.ledger.balances.set('mo', 100_000);
});

describe('purchaseBundle', () => {
  it('charges the bundle price once and grants all three items', async () => {
    const r = await purchaseBundle('mo', pick, NOW);
    expect(r.price).toBe(price);
    expect(r.newBalance).toBe(100_000 - price);
    expect(w.inventory.rows.map((x) => x.itemId).sort()).toEqual([...pick].sort());
    expect(w.ledger.calls).toHaveLength(1);
  });

  it('grants nothing and charges nothing when the member cannot afford it', async () => {
    w.ledger.balances.set('mo', price - 1);
    await expect(purchaseBundle('mo', pick, NOW)).rejects.toMatchObject({
      code: 'INSUFFICIENT_COINS',
    });
    expect(w.inventory.rows).toHaveLength(0);
    expect(w.ledger.balance('mo')).toBe(price - 1);
  });

  it('refuses if any one item is already owned — no partial bundle, no charge', async () => {
    w.inventory.insert({ userId: 'mo', itemId: pick[1], kind: 'BADGE' });
    await expect(purchaseBundle('mo', pick, NOW)).rejects.toMatchObject({ code: 'ALREADY_OWNED' });
    expect(w.inventory.rows).toHaveLength(1);
    expect(w.ledger.calls).toHaveLength(0);
  });

  it('rolls the charge back if the inventory write fails midway', async () => {
    // A unique-key race: another purchase grants one of the items between our
    // ownership check and our insert.
    const realCreateMany = w.inventory.api.createMany;
    w.inventory.api.createMany = async () => {
      throw Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });
    };
    await expect(purchaseBundle('mo', pick, NOW)).rejects.toMatchObject({ code: 'ALREADY_OWNED' });
    w.inventory.api.createMany = realCreateMany;
    expect(w.inventory.rows).toHaveLength(0);
    expect(w.ledger.balance('mo')).toBe(100_000); // the debit unwound with the transaction
  });

  it('rejects a selection that is not three of today’s featured items', async () => {
    await expect(purchaseBundle('mo', pick.slice(0, 2), NOW)).rejects.toBeInstanceOf(BundleError);
    const notFeatured = ['ghost-1', 'ghost-2', 'ghost-3'];
    await expect(purchaseBundle('mo', notFeatured, NOW)).rejects.toMatchObject({
      code: 'INVALID_BUNDLE',
    });
    // Yesterday's featured set is not today's.
    const yesterday = dailyFeaturedIds('2026-10-11')
      .filter((id) => !featured.includes(id))
      .slice(0, 3);
    await expect(purchaseBundle('mo', yesterday, NOW)).rejects.toMatchObject({
      code: 'INVALID_BUNDLE',
    });
    expect(w.ledger.calls).toHaveLength(0);
  });

  it('a retried identical request does not charge or grant twice', async () => {
    await purchaseBundle('mo', pick, NOW);
    await expect(purchaseBundle('mo', pick, NOW)).rejects.toMatchObject({ code: 'ALREADY_OWNED' });
    expect(w.ledger.calls).toHaveLength(1);
    expect(w.inventory.rows).toHaveLength(3);
  });

  it('even if the items vanish, the same bundle cannot be re-bought for free via the ledger key', async () => {
    await purchaseBundle('mo', pick, NOW);
    w.inventory.reset(); // e.g. sold on the market
    await expect(purchaseBundle('mo', pick, NOW)).rejects.toMatchObject({
      code: 'ALREADY_PURCHASED',
    });
    expect(w.inventory.rows).toHaveLength(0);
    expect(w.ledger.calls).toHaveLength(1);
  });
});
