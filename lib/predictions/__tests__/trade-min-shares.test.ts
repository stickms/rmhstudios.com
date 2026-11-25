import { beforeEach, describe, expect, it, vi } from 'vitest';
import { sharesForBudget } from '../lmsr';
import { makeFakeDb, makePosition } from './fake-market';

let fake = makeFakeDb();

vi.mock('@/lib/prisma.server', () => ({ prisma: { $transaction: (cb: never) => fake.db.$transaction(cb) } }));
vi.mock('@/lib/economy/ledger.server', () => ({
  creditCoins: (...a: Parameters<typeof fake.ledger.creditCoins>) => fake.ledger.creditCoins(...a),
  debitCoins: (...a: Parameters<typeof fake.ledger.debitCoins>) => fake.ledger.debitCoins(...a),
  getBalance: (u: string) => fake.ledger.getBalance(u),
  InsufficientFundsError: class InsufficientFundsError extends Error {},
}));

import { placeTrade, PredictionError } from '../predictions.server';

beforeEach(() => {
  fake = makeFakeDb({ positions: [makePosition({ userId: 'u2', id: 'pos-u2' })] });
});

const quote = () => sharesForBudget(60, 20, 120, 'YES', 50);

describe('placeTrade minShares', () => {
  it('refuses a buy that would land below minShares and moves nothing', async () => {
    const before = structuredClone(fake.state);
    const err = await placeTrade({
      userId: 'u1',
      predictionId: 'm1',
      side: 'YES',
      amount: 50,
      minShares: quote() * 1.01,
    }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(PredictionError);
    expect((err as PredictionError).refusal).toBe('PREDICTION_PRICE_MOVED');
    expect(fake.state.ledger).toHaveLength(0);
    expect(fake.state.balances).toEqual(before.balances);
    expect(fake.state.market).toEqual(before.market);
    expect(fake.state.positions).toEqual(before.positions);
    expect(fake.state.writes).not.toContain('ledger.debit');
    expect(fake.state.writes).not.toContain('position.upsert');
    expect(fake.state.writes).not.toContain('prediction.update');
  });

  it('buys when the shares are at or above minShares', async () => {
    const out = await placeTrade({
      userId: 'u1',
      predictionId: 'm1',
      side: 'YES',
      amount: 50,
      minShares: quote() * 0.98,
    });
    expect(out.sharesBought).toBeCloseTo(quote(), 9);
    expect(fake.state.balances.u1).toBe(50);
    expect(fake.state.market.qYes).toBeCloseTo(60 + quote(), 9);
  });

  it('buys with no minShares, as the bot market-makers do', async () => {
    const out = await placeTrade({ userId: 'u1', predictionId: 'm1', side: 'NO', amount: 10 });
    expect(out.sharesBought).toBeGreaterThan(10);
    expect(out.market.position).toMatchObject({ received: 0 });
  });
});
