import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Coin-transfer edge cases (#566). The overdraft guard is the repo-wide idiom in
 * lib/wager/escrow.server#debitCoins: a conditional `updateMany` with
 * `coins: { gte: amount }` so a losing concurrent debit gets count 0 and throws.
 *
 * A true multi-connection Postgres race needs a live DB (not wired into this
 * node-env vitest run). Instead the fake wallet below models the DB's *atomic*
 * conditional UPDATE — the check-and-decrement happens synchronously in one
 * updateMany call, exactly as `UPDATE ... WHERE coins >= amount` does — so two
 * interleaved debits exhibit the same "exactly one wins" outcome the guard
 * guarantees, and these tests fail against a naive read-check-write debit.
 */

const prismaMock = vi.hoisted(() => ({
  user: { findUnique: vi.fn() },
  coinTransaction: { count: vi.fn() },
  $transaction: vi.fn(),
}));
vi.mock('@/lib/prisma.server', () => ({ prisma: prismaMock }));
vi.mock('@/lib/notifications.server', () => ({ createNotification: vi.fn().mockResolvedValue(undefined) }));

import { debitCoins, creditCoins, EscrowError, type Tx } from '@/lib/wager/escrow.server';
import { sendCoinGift, CoinGiftError, GIFT_MIN, GIFT_DAILY_CAP } from '@/lib/gifting/coin-gift.server';

/** A tx whose userProfile.updateMany enforces the same atomic guard as Postgres. */
function makeWallet(balance: number) {
  const state = { coins: balance };
  const tx = {
    userProfile: {
      upsert: vi.fn(async () => ({})),
      // Atomic conditional decrement: check + write in one indivisible step.
      updateMany: vi.fn(async ({ where, data }: { where: { coins?: { gte: number } }; data: { coins: { decrement: number } } }) => {
        const need = where.coins?.gte ?? 0;
        if (state.coins >= need) {
          state.coins -= data.coins.decrement;
          return { count: 1 };
        }
        return { count: 0 };
      }),
    },
    coinTransaction: { create: vi.fn(async () => ({})) },
  };
  return { tx: tx as unknown as Tx, state, raw: tx };
}

beforeEach(() => {
  prismaMock.user.findUnique.mockReset();
  prismaMock.coinTransaction.count.mockReset();
  prismaMock.$transaction.mockReset();
});

describe('debitCoins — atomic overdraft guard', () => {
  it('rejects a zero, negative, or non-integer amount before any write', async () => {
    const { tx, raw } = makeWallet(100);
    for (const bad of [0, -5, 3.5, NaN]) {
      await expect(debitCoins(tx, 'u', bad)).rejects.toMatchObject({ code: 'INVALID_AMOUNT' });
    }
    expect(raw.userProfile.updateMany).not.toHaveBeenCalled();
  });

  it('debits via a `coins >= amount` conditional update (the anti-race guard)', async () => {
    const { tx, raw, state } = makeWallet(100);
    await debitCoins(tx, 'u', 30);
    expect(state.coins).toBe(70);
    expect(raw.userProfile.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ userId: 'u', coins: { gte: 30 } }), data: { coins: { decrement: 30 } } }),
    );
  });

  it('allows an exact-balance debit (amount === balance) and lands at zero', async () => {
    const { tx, state } = makeWallet(50);
    await expect(debitCoins(tx, 'u', 50)).resolves.toBeUndefined();
    expect(state.coins).toBe(0);
  });

  it('throws INSUFFICIENT_COINS when the balance is too low', async () => {
    const { tx, state } = makeWallet(40);
    await expect(debitCoins(tx, 'u', 80)).rejects.toBeInstanceOf(EscrowError);
    expect(state.coins).toBe(40); // untouched — conditional update matched no row
  });

  it('concurrent drain: two debits summing over balance settle to exactly one success', async () => {
    const { tx, state } = makeWallet(100);
    const results = await Promise.allSettled([debitCoins(tx, 'u', 80), debitCoins(tx, 'u', 80)]);
    const ok = results.filter((r) => r.status === 'fulfilled');
    const failed = results.filter((r) => r.status === 'rejected');
    expect(ok).toHaveLength(1);
    expect(failed).toHaveLength(1);
    expect((failed[0] as PromiseRejectedResult).reason).toMatchObject({ code: 'INSUFFICIENT_COINS' });
    expect(state.coins).toBe(20); // one 80 debit applied, never negative
  });
});

describe('creditCoins', () => {
  it('ignores non-positive amounts (never mints on a bad credit)', async () => {
    const { tx, raw } = makeWallet(0);
    await creditCoins(tx, 'u', 0);
    await creditCoins(tx, 'u', -10);
    expect(raw.userProfile.upsert).not.toHaveBeenCalled();
  });
});

describe('sendCoinGift', () => {
  function stubRecipient(receiveGifts: boolean | null = true) {
    prismaMock.user.findUnique.mockResolvedValue({ id: 'r', profile: receiveGifts === null ? null : { receiveGifts } });
    prismaMock.coinTransaction.count.mockResolvedValue(0);
  }

  it('rejects a self-gift (no balance movement)', async () => {
    await expect(sendCoinGift({ gifterId: 'a', recipientId: 'a', amount: 100 })).rejects.toMatchObject({ code: 'SELF' });
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it('rejects an out-of-range amount', async () => {
    await expect(sendCoinGift({ gifterId: 'a', recipientId: 'b', amount: GIFT_MIN - 1 })).rejects.toMatchObject({ code: 'INVALID' });
  });

  it('rejects a recipient who has opted out of gifts', async () => {
    stubRecipient(false);
    await expect(sendCoinGift({ gifterId: 'a', recipientId: 'r', amount: 100 })).rejects.toMatchObject({ code: 'DISABLED' });
  });

  it('enforces the daily send cap', async () => {
    prismaMock.user.findUnique.mockResolvedValue({ id: 'r', profile: { receiveGifts: true } });
    prismaMock.coinTransaction.count.mockResolvedValue(GIFT_DAILY_CAP);
    await expect(sendCoinGift({ gifterId: 'a', recipientId: 'r', amount: 100 })).rejects.toMatchObject({ code: 'CAP' });
  });

  it('surfaces an overdraft as INSUFFICIENT_COINS', async () => {
    stubRecipient(true);
    const wallet = makeWallet(50); // less than the 100 gift
    prismaMock.$transaction.mockImplementation(async (cb: (tx: Tx) => Promise<unknown>) => cb(wallet.tx));
    await expect(sendCoinGift({ gifterId: 'a', recipientId: 'r', amount: 100 })).rejects.toMatchObject({ code: 'INSUFFICIENT_COINS' });
    expect(wallet.state.coins).toBe(50); // debit never applied
  });

  it('settles a valid gift: debits the sender and writes one GIFT ledger row', async () => {
    stubRecipient(true);
    const wallet = makeWallet(500);
    prismaMock.$transaction.mockImplementation(async (cb: (tx: Tx) => Promise<unknown>) => cb(wallet.tx));
    await expect(sendCoinGift({ gifterId: 'a', recipientId: 'r', amount: 100, note: 'gg' })).resolves.toEqual({ ok: true });
    expect(wallet.state.coins).toBe(400);
    expect(wallet.raw.coinTransaction.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ senderId: 'a', recipientId: 'r', amount: 100, type: 'GIFT', entityType: 'gift' }) }),
    );
  });
});
