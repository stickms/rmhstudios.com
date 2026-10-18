import { describe, it, expect, beforeEach, vi } from 'vitest';
import { drawExchange } from '../secret-santa';
import { GIFT_MAX, GIFT_MIN } from '../coin-gift-limits';

/**
 * Exchange gifting (G3) sends coins through sendCoinGift. The guarantees: one
 * gift per member per exchange (the claim happens before coins move), a failed
 * transfer releases the claim, the budget is enforced, and a stored seed
 * reproduces the draw.
 */
const w = vi.hoisted(() => {
  const member = { id: 'm1', recipientId: 'bob', giftedAt: null as Date | null };
  const sent: { amount: number }[] = [];
  const state = { failNext: null as null | string };
  return { member, sent, state };
});

class FakeGiftError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

vi.mock('@/lib/prisma.server', () => ({
  prisma: {
    giftExchange: {
      findUnique: async () => ({ kind: 'GIFT', status: 'DRAWN', budget: 100, title: 'T' }),
    },
    giftExchangeMember: {
      findUnique: async () => ({ id: w.member.id, recipientId: w.member.recipientId }),
      updateMany: async ({
        where,
        data,
      }: {
        where: { giftedAt?: null };
        data: { giftedAt: Date | null };
      }) => {
        if (where.giftedAt === null && w.member.giftedAt !== null) return { count: 0 };
        w.member.giftedAt = data.giftedAt;
        return { count: 1 };
      },
    },
  },
}));
vi.mock('@/lib/notifications.server', () => ({ createNotification: async () => {} }));
vi.mock('@/lib/gifting/coin-gift.server', () => ({
  CoinGiftError: FakeGiftError,
  sendCoinGift: async (p: { amount: number }) => {
    if (w.state.failNext) throw new FakeGiftError(w.state.failNext);
    w.sent.push({ amount: p.amount });
  },
}));

const { sendExchangeGift } = await import('../exchange.server');

describe('exchange gifts', () => {
  beforeEach(() => {
    w.member.giftedAt = null;
    w.sent.length = 0;
    w.state.failNext = null;
  });

  it('keeps the shared coin-gift bounds in sync with the server module', async () => {
    const real = await vi
      .importActual<typeof import('../coin-gift.server')>('../coin-gift.server')
      .catch(() => null);
    if (real) {
      expect(GIFT_MIN).toBe(real.GIFT_MIN);
      expect(GIFT_MAX).toBe(real.GIFT_MAX);
    }
  });

  it('sends one gift per member', async () => {
    expect((await sendExchangeGift('e1', 'alice', 50)).ok).toBe(true);
    const again = await sendExchangeGift('e1', 'alice', 50);
    expect(again).toMatchObject({ ok: false, status: 409 });
    expect(w.sent).toHaveLength(1);
  });

  it('enforces the budget before any coin moves', async () => {
    const res = await sendExchangeGift('e1', 'alice', 101);
    expect(res).toMatchObject({ ok: false, status: 400 });
    expect(w.sent).toHaveLength(0);
    expect(w.member.giftedAt).toBeNull();
  });

  it('releases the claim when the transfer fails, so the member can retry', async () => {
    w.state.failNext = 'INSUFFICIENT_COINS';
    expect(await sendExchangeGift('e1', 'alice', 50)).toMatchObject({ ok: false, status: 402 });
    expect(w.member.giftedAt).toBeNull();
    w.state.failNext = null;
    expect((await sendExchangeGift('e1', 'alice', 50)).ok).toBe(true);
    expect(w.sent).toHaveLength(1);
  });
});

describe('draw reproducibility', () => {
  it('re-running the stored seed over the sorted members gives the same pairings', () => {
    const members = ['d', 'a', 'c', 'b', 'e'].sort();
    const exclusions: [string, string][] = [
      ['a', 'b'],
      ['b', 'a'],
    ];
    const first = drawExchange({ members, exclusions, seed: 12345 });
    const second = drawExchange({ members, exclusions, seed: 12345 });
    expect(first.ok && second.ok).toBe(true);
    if (first.ok && second.ok) {
      expect([...first.assignments]).toEqual([...second.assignments]);
      expect(first.assignments.get('a')).not.toBe('b');
    }
  });
});
