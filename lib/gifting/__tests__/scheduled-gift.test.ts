import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * Scheduled gift delivery (C7) — pay at send, deliver or refund exactly once.
 *
 * The sender's coins are spent at send time, so the failure mode that matters is
 * a gift that ends two ways at once (delivered AND refunded, or refunded twice)
 * or neither (paid, then lost). Every exit claims `status = SCHEDULED`; these
 * tests check the exits really are mutually exclusive.
 */

const w = await vi.hoisted(async () => {
  const { Table, FakeLedger, makeTransaction } = await import('../../economy/__tests__/fake-db');
  const gifts = new Table({
    defaults: () => ({ status: 'SCHEDULED', deliveredAt: null, unwrappedAt: null, message: null }),
  });
  const inventory = new Table({
    unique: [['userId', 'itemId']],
    compound: { userId_itemId: ['userId', 'itemId'] },
  });
  const users = new Table();
  const blocks = new Table();
  const ledger = new FakeLedger();
  const notified: { userId: string; preview: string }[] = [];
  const prisma: Record<string, unknown> = {
    scheduledGift: {
      ...gifts.api,
      // The sender/recipient joins are irrelevant to the money paths.
    },
    userInventory: inventory.api,
    user: users.api,
    userBlock: blocks.api,
  };
  prisma.$transaction = makeTransaction([gifts, inventory], ledger, () => prisma);
  return { gifts, inventory, users, blocks, ledger, prisma, notified };
});

vi.mock('@/lib/prisma.server', () => ({ prisma: w.prisma }));
vi.mock('@/lib/economy/ledger.server', async () => {
  const { FakeInsufficientFundsError } = await import('../../economy/__tests__/fake-db');
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
vi.mock('@/lib/shop/catalog', () => ({
  getShopItem: (id: string) =>
    id === 'frame-gold'
      ? { id, name: 'Gold Frame', kind: 'AVATAR_FRAME', price: 400 }
      : id === 'pro-only'
        ? { id, name: 'Pro Thing', kind: 'BADGE', price: 900, requiresTier: 'pro' }
        : undefined,
}));

import {
  cancelScheduledGift,
  deliverDueGifts,
  scheduleGift,
  unwrapGift,
} from '@/lib/gifting/scheduled-gift.server';

const NOW = new Date('2026-10-12T12:00:00Z');
const LATER = '2026-12-25T09:00:00.000Z';
const AFTER = new Date('2026-12-25T09:01:00Z');

beforeEach(() => {
  w.gifts.reset();
  w.inventory.reset();
  w.users.reset();
  w.blocks.reset();
  w.ledger.reset();
  w.notified.length = 0;
  w.users.insert({ id: 'sam', handle: 'sam' });
  w.users.insert({ id: 'rae', handle: 'rae' });
  w.ledger.balances.set('sam', 1000);
});

// The fake `user.findFirst` has no case-insensitive mode; handles are lower-case here.
const send = (over: Record<string, unknown> = {}) =>
  scheduleGift(
    'sam',
    { recipient: 'rae', itemId: 'frame-gold', deliverAt: LATER, ...over } as never,
    NOW,
  );

describe('scheduleGift', () => {
  it('charges the full price once, at send time, and records the gift', async () => {
    const { id, price } = await send();
    expect(price).toBe(400);
    expect(w.ledger.balance('sam')).toBe(600);
    expect(w.ledger.calls).toHaveLength(1);
    expect(w.ledger.calls[0]!.key).toBe(`sgift-pay:${id}`);
    expect(w.gifts.rows[0]).toMatchObject({
      senderId: 'sam',
      recipientId: 'rae',
      status: 'SCHEDULED',
    });
    // Nothing is delivered yet.
    expect(w.inventory.rows).toHaveLength(0);
  });

  it('rolls back the gift row when the sender cannot pay', async () => {
    w.ledger.balances.set('sam', 100);
    await expect(send()).rejects.toMatchObject({ code: 'INSUFFICIENT_COINS' });
    expect(w.gifts.rows).toHaveLength(0);
    expect(w.ledger.balance('sam')).toBe(100);
  });

  it.each([
    ['a date in the past', { deliverAt: '2026-10-01T00:00:00.000Z' }, 'BAD_DATE'],
    ['a date under the minimum lead', { deliverAt: '2026-10-12T12:01:00.000Z' }, 'BAD_DATE'],
    ['yourself', { recipient: 'sam' }, 'SELF'],
    ['an unknown member', { recipient: 'ghost' }, 'NO_SUCH_MEMBER'],
    ['an unknown item', { itemId: 'nope' }, 'UNKNOWN_ITEM'],
    ['a tier-gated item', { itemId: 'pro-only' }, 'NOT_GIFTABLE'],
  ])('rejects %s without charging', async (_label, over, code) => {
    await expect(send(over)).rejects.toMatchObject({ code });
    expect(w.ledger.calls).toHaveLength(0);
  });

  it('rejects a recipient who already owns the item, or a blocked pair', async () => {
    w.inventory.insert({ userId: 'rae', itemId: 'frame-gold' });
    await expect(send()).rejects.toMatchObject({ code: 'RECIPIENT_OWNS' });

    w.inventory.reset();
    w.blocks.insert({ blockerId: 'rae', blockedId: 'sam' });
    await expect(send()).rejects.toMatchObject({ code: 'BLOCKED' });
    expect(w.ledger.calls).toHaveLength(0);
  });

  it('will not stack two pending gifts of the same item to the same member', async () => {
    await send();
    await expect(send()).rejects.toMatchObject({ code: 'DUPLICATE' });
    expect(w.ledger.balance('sam')).toBe(600);
  });
});

describe('deliverDueGifts', () => {
  it('does nothing before the delivery time', async () => {
    await send();
    const r = await deliverDueGifts(NOW);
    expect(r).toMatchObject({ delivered: 0, refunded: 0 });
    expect(w.inventory.rows).toHaveLength(0);
  });

  it('grants the item at the delivery time and notifies the recipient', async () => {
    await send();
    const r = await deliverDueGifts(AFTER);

    expect(r.delivered).toBe(1);
    expect(w.inventory.rows).toEqual([
      expect.objectContaining({ userId: 'rae', itemId: 'frame-gold', kind: 'AVATAR_FRAME' }),
    ]);
    expect(w.gifts.rows[0]).toMatchObject({ status: 'DELIVERED', unwrappedAt: null });
    expect(w.notified).toEqual([expect.objectContaining({ userId: 'rae' })]);
    expect(w.ledger.balance('sam')).toBe(600); // no refund
  });

  it('is idempotent: a second run delivers nothing more and grants nothing twice', async () => {
    await send();
    await deliverDueGifts(AFTER);
    await deliverDueGifts(AFTER);
    expect(w.inventory.rows).toHaveLength(1);
    expect(w.notified).toHaveLength(1);
  });

  it('overlapping runs deliver exactly once', async () => {
    await send();
    await Promise.all([deliverDueGifts(AFTER), deliverDueGifts(AFTER)]);
    expect(w.inventory.rows).toHaveLength(1);
    expect(w.ledger.calls.filter((c) => c.kind === 'credit')).toHaveLength(0);
  });

  it('refunds the sender if the recipient bought the item in the meantime', async () => {
    await send();
    w.inventory.insert({ userId: 'rae', itemId: 'frame-gold' });
    const r = await deliverDueGifts(AFTER);

    expect(r.refunded).toBe(1);
    expect(w.gifts.rows[0]!.status).toBe('REFUNDED');
    expect(w.ledger.balance('sam')).toBe(1000);
    expect(w.inventory.rows).toHaveLength(1); // still just the one they bought
    await deliverDueGifts(AFTER);
    expect(w.ledger.balance('sam')).toBe(1000); // not refunded twice
  });

  it('refunds the sender if the recipient account is gone', async () => {
    await send();
    w.gifts.rows[0]!.recipientId = null; // ON DELETE SET NULL
    await deliverDueGifts(AFTER);
    expect(w.gifts.rows[0]!.status).toBe('REFUNDED');
    expect(w.ledger.balance('sam')).toBe(1000);
  });
});

describe('cancelScheduledGift', () => {
  it('refunds the sender once and stops delivery', async () => {
    const { id } = await send();
    await cancelScheduledGift('sam', id);

    expect(w.ledger.balance('sam')).toBe(1000);
    expect(w.gifts.rows[0]!.status).toBe('CANCELLED');
    await deliverDueGifts(AFTER);
    expect(w.inventory.rows).toHaveLength(0);
    await expect(cancelScheduledGift('sam', id)).rejects.toMatchObject({ code: 'BAD_STATE' });
    expect(w.ledger.balance('sam')).toBe(1000);
  });

  it('cannot cancel a delivered gift, nor someone else’s', async () => {
    const { id } = await send();
    await expect(cancelScheduledGift('rae', id)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await deliverDueGifts(AFTER);
    await expect(cancelScheduledGift('sam', id)).rejects.toMatchObject({ code: 'BAD_STATE' });
    expect(w.inventory.rows).toHaveLength(1);
    expect(w.ledger.balance('sam')).toBe(600);
  });

  it('cancel and delivery racing never both win', async () => {
    const { id } = await send();
    await Promise.allSettled([cancelScheduledGift('sam', id), deliverDueGifts(AFTER)]);
    const delivered = w.inventory.rows.length === 1;
    const refunded = w.ledger.balance('sam') === 1000;
    expect(delivered).not.toBe(refunded); // exactly one outcome
  });
});

describe('unwrapGift', () => {
  it('only the recipient can open it, once or many times', async () => {
    const { id } = await send({ message: 'Happy birthday!' });
    await deliverDueGifts(AFTER);

    await expect(unwrapGift('sam', id, AFTER)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    const first = await unwrapGift('rae', id, AFTER);
    expect(first).toMatchObject({ itemName: 'Gold Frame', message: 'Happy birthday!' });
    const stamped = w.gifts.rows[0]!.unwrappedAt;
    await unwrapGift('rae', id, new Date('2027-01-01T00:00:00Z'));
    expect(w.gifts.rows[0]!.unwrappedAt).toEqual(stamped); // the first open time sticks
  });

  it('cannot open a gift that has not been delivered', async () => {
    const { id } = await send();
    await expect(unwrapGift('rae', id, NOW)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});
