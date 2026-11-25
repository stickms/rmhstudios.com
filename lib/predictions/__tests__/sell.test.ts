import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cost, priceYes, proceedsForShares } from '../lmsr';
import { makeFakeDb, makeMarket, makePosition } from './fake-market';

let fake = makeFakeDb();

vi.mock('@/lib/prisma.server', () => ({ prisma: { $transaction: (cb: never) => fake.db.$transaction(cb) } }));
vi.mock('@/lib/economy/ledger.server', () => ({
  creditCoins: (...a: Parameters<typeof fake.ledger.creditCoins>) => fake.ledger.creditCoins(...a),
  debitCoins: (...a: Parameters<typeof fake.ledger.debitCoins>) => fake.ledger.debitCoins(...a),
  getBalance: (u: string) => fake.ledger.getBalance(u),
  InsufficientFundsError: class InsufficientFundsError extends Error {},
}));

import { PredictionError, sellShares } from '../predictions.server';

const KEY = 'key-aaaa-1111';
const base = { userId: 'u1', predictionId: 'm1', side: 'YES' as const, shares: 10, minProceeds: 0, key: KEY };

async function refusal(p: Promise<unknown>): Promise<PredictionError> {
  try {
    await p;
  } catch (e) {
    expect(e).toBeInstanceOf(PredictionError);
    return e as PredictionError;
  }
  throw new Error('expected a refusal');
}

beforeEach(() => {
  fake = makeFakeDb();
});

describe('sellShares refusals', () => {
  it('refuses more shares than are held, and moves nothing', async () => {
    const before = structuredClone(fake.state.market);
    const e = await refusal(sellShares({ ...base, shares: 40.5 }));
    expect(e.refusal).toBe('PREDICTION_NOT_ENOUGH_SHARES');
    expect(fake.state.market.qYes).toBe(before.qYes);
    expect(fake.state.positions[0]!.yesShares).toBe(40);
    expect(fake.state.ledger).toHaveLength(0);
  });

  it('refuses a member with no position', async () => {
    const e = await refusal(sellShares({ ...base, userId: 'u2' }));
    expect(e.refusal).toBe('PREDICTION_NOT_ENOUGH_SHARES');
  });

  it('refuses the side the member does not hold', async () => {
    const e = await refusal(sellShares({ ...base, side: 'NO' }));
    expect(e.refusal).toBe('PREDICTION_NOT_ENOUGH_SHARES');
  });

  it('refuses a closed market', async () => {
    fake = makeFakeDb({ market: makeMarket({ closesAt: new Date(Date.now() - 1000) }) });
    expect((await refusal(sellShares(base))).code).toBe('CLOSED');
  });

  it.each(['RESOLVED_YES', 'RESOLVED_NO'])('refuses a %s market', async (status) => {
    fake = makeFakeDb({ market: makeMarket({ status }) });
    expect((await refusal(sellShares(base))).code).toBe('NOT_OPEN');
    expect(fake.state.ledger).toHaveLength(0);
  });

  it('refuses when the price moved below minProceeds', async () => {
    const quote = proceedsForShares(60, 20, 120, 'YES', 10);
    const e = await refusal(sellShares({ ...base, minProceeds: quote + 1 }));
    expect(e.refusal).toBe('PREDICTION_PRICE_MOVED');
    expect(fake.state.positions[0]!.yesShares).toBe(40);
    expect(fake.state.market.qYes).toBe(60);
    expect(fake.state.ledger).toHaveLength(0);
  });

  it('refuses a sale worth under one coin', async () => {
    const e = await refusal(sellShares({ ...base, shares: 0.5 }));
    expect(e.code).toBe('TRADE_TOO_SMALL');
    expect(fake.state.ledger).toHaveLength(0);
  });
});

describe('sellShares', () => {
  it('pays the rounded-down proceeds, lowers q by the shares sold, and updates received and lastP', async () => {
    const expected = proceedsForShares(60, 20, 120, 'YES', 10);
    const out = await sellShares(base);
    expect(out).toMatchObject({ sharesSold: 10, proceeds: expected, replayed: false, newBalance: 100 + expected });
    expect(fake.state.market.qYes).toBe(50);
    expect(fake.state.market.qNo).toBe(20);
    const pos = fake.state.positions[0]!;
    expect(pos.yesShares).toBe(30);
    expect(pos.received).toBe(expected);
    expect(pos.spent).toBe(25);
    expect(pos.lastP).toBeCloseTo(priceYes(50, 20, 120), 12);
    expect(out.market.qYes).toBe(50);
    expect(out.market.position).toMatchObject({ yesShares: 30, received: expected });
  });

  it('lowers qNo when NO shares are sold', async () => {
    fake = makeFakeDb({ positions: [makePosition({ yesShares: 0, noShares: 30 })] });
    const out = await sellShares({ ...base, side: 'NO', shares: 12 });
    expect(fake.state.market.qNo).toBe(8);
    expect(fake.state.market.qYes).toBe(60);
    expect(fake.state.positions[0]!.noShares).toBe(18);
    expect(out.proceeds).toBe(proceedsForShares(60, 20, 120, 'NO', 12));
  });

  it('writes one ledger entry: WAGER, entity prediction, the member-scoped key', async () => {
    const out = await sellShares(base);
    expect(fake.state.ledger).toEqual([
      {
        userId: 'u1',
        amount: out.proceeds,
        type: 'WAGER',
        entityType: 'prediction',
        entityId: 'm1',
        note: 'YES shares sold',
        idempotencyKey: `prediction-sale:m1:u1:${KEY}`,
      },
    ]);
  });

  it('clamps a request within 1e-9 over the holding to the holding (sell all of a fractional holding)', async () => {
    fake = makeFakeDb({ positions: [makePosition({ yesShares: 12.3456789 })] });
    const out = await sellShares({ ...base, shares: 12.3456789 + 5e-10 });
    expect(out.sharesSold).toBe(12.3456789);
    expect(fake.state.positions[0]!.yesShares).toBe(0);
    expect(fake.state.market.qYes).toBeCloseTo(60 - 12.3456789, 12);
  });

  it('a replayed key returns replayed: true and writes nothing', async () => {
    const first = await sellShares(base);
    const writesAfterFirst = fake.state.writes.length;
    const market = structuredClone(fake.state.market);
    const position = structuredClone(fake.state.positions);
    const again = await sellShares(base);
    expect(again.replayed).toBe(true);
    expect(again.proceeds).toBe(first.proceeds);
    expect(fake.state.writes).toHaveLength(writesAfterFirst);
    expect(fake.state.market).toEqual(market);
    expect(fake.state.positions).toEqual(position);
    expect(fake.state.ledger).toHaveLength(1);
    expect(fake.state.positions[0]!.yesShares).toBe(30);
  });

  it('a replay is answered before any guard: it works on a market that has since resolved', async () => {
    await sellShares(base);
    fake.state.market.status = 'RESOLVED_YES';
    expect((await sellShares(base)).replayed).toBe(true);
  });

  it("scopes the key to the member: another member's identical key is its own sale", async () => {
    fake = makeFakeDb({ positions: [makePosition(), makePosition({ id: 'pos-u2', userId: 'u2' })] });
    await sellShares(base);
    const other = await sellShares({ ...base, userId: 'u2' });
    expect(other.replayed).toBe(false);
    expect(fake.state.ledger.map((l) => l.idempotencyKey)).toEqual([
      `prediction-sale:m1:u1:${KEY}`,
      `prediction-sale:m1:u2:${KEY}`,
    ]);
  });

  it('two concurrent sales of the whole position: one wins, the other is refused, q falls once', async () => {
    const results = await Promise.allSettled([
      sellShares({ ...base, shares: 40, key: 'key-first-0001' }),
      sellShares({ ...base, shares: 40, key: 'key-second-002' }),
    ]);
    const ok = results.filter((r) => r.status === 'fulfilled');
    const bad = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
    expect(ok).toHaveLength(1);
    expect(bad).toHaveLength(1);
    expect((bad[0]!.reason as PredictionError).refusal).toBe('PREDICTION_NOT_ENOUGH_SHARES');
    expect(fake.state.market.qYes).toBe(20);
    expect(fake.state.positions[0]!.yesShares).toBe(0);
    expect(fake.state.ledger).toHaveLength(1);
  });

  it('a retry with the same key that queued behind the original replays and does not take the shares again', async () => {
    // Both requests pass the first replay check before either commits; the second then waits on the lock.
    const results = await Promise.all([sellShares(base), sellShares(base)]);
    expect(results.map((r) => r.replayed).sort()).toEqual([false, true]);
    expect(fake.state.positions[0]!.yesShares).toBe(30);
    expect(fake.state.market.qYes).toBe(50);
    expect(fake.state.ledger).toHaveLength(1);
    expect(fake.state.balances.u1).toBe(100 + results[0]!.proceeds);
  });

  it('rolls the sale back when the ledger credits nothing for its key', async () => {
    const credit = fake.ledger.creditCoins;
    fake.ledger.creditCoins = async () => ({ applied: false, replayed: true, transactionId: 'tx' });
    await expect(sellShares(base)).rejects.toBeInstanceOf(PredictionError);
    fake.ledger.creditCoins = credit;
    expect(fake.state.positions[0]!.yesShares).toBe(40);
    expect(fake.state.market.qYes).toBe(60);
  });

  it("never pays more than the market took in: sell everything bought through the market's own cost function", async () => {
    const start = { qYes: 60, qNo: 20 };
    const out = await sellShares({ ...base, shares: 40 });
    const exact = cost(start.qYes, start.qNo, 120) - cost(fake.state.market.qYes, fake.state.market.qNo, 120);
    expect(out.proceeds).toBeLessThanOrEqual(exact);
  });
});
