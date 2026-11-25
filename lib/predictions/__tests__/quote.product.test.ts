import { describe, expect, it } from 'vitest';
import { costToBuyShares, pricePercent, proceedsForShares, sharesForBudget } from '../lmsr';
import { MIN_SHARES_SLIPPAGE, quoteSale, quoteTrade } from '../quote';

const MARKET = { qYes: 40, qNo: 15, b: 120 };

describe('quoteTrade', () => {
  it('equals the numbers the server computes for the same state', () => {
    const q = quoteTrade(MARKET, 'YES', 50);
    const shares = sharesForBudget(MARKET.qYes, MARKET.qNo, MARKET.b, 'YES', 50);
    expect(q.shares).toBe(shares);
    expect(q.cost).toBe(costToBuyShares(MARKET.qYes, MARKET.qNo, MARKET.b, 'YES', shares));
    expect(q.newYesPercent).toBe(pricePercent(MARKET.qYes + shares, MARKET.qNo, MARKET.b));
  });

  it('shows 50 coins buying shares at an average under a coin, and the odds moving toward the side bought', () => {
    const q = quoteTrade({ qYes: 0, qNo: 0, b: 120 }, 'YES', 50);
    expect(q.shares).toBeGreaterThan(50);
    expect(q.averagePrice).toBeCloseTo(50 / q.shares, 10);
    expect(q.averagePrice).toBeLessThan(1);
    expect(q.newYesPercent).toBeGreaterThan(50);
  });

  it('moves NO buys the other way', () => {
    expect(quoteTrade({ qYes: 0, qNo: 0, b: 120 }, 'NO', 50).newYesPercent).toBeLessThan(50);
  });

  it('allows the buy to land 2% under the quote', () => {
    const q = quoteTrade(MARKET, 'NO', 25);
    expect(MIN_SHARES_SLIPPAGE).toBe(0.02);
    expect(q.minShares).toBeCloseTo(q.shares * 0.98, 10);
  });

  it('quotes nothing for an empty amount', () => {
    expect(quoteTrade(MARKET, 'YES', 0)).toMatchObject({ shares: 0, cost: 0, averagePrice: 0, minShares: 0 });
  });
});

describe('quoteSale', () => {
  it('equals proceedsForShares, in whole coins', () => {
    const s = quoteSale(MARKET, 'YES', 12.5);
    expect(s.proceeds).toBe(proceedsForShares(MARKET.qYes, MARKET.qNo, MARKET.b, 'YES', 12.5));
    expect(Number.isInteger(s.proceeds)).toBe(true);
    expect(s.minProceeds).toBe(Math.floor(s.proceeds * 0.98));
  });

  it('moves the odds against the side sold', () => {
    const before = pricePercent(MARKET.qYes, MARKET.qNo, MARKET.b);
    expect(quoteSale(MARKET, 'YES', 30).newYesPercent).toBeLessThan(before);
    expect(quoteSale(MARKET, 'NO', 10).newYesPercent).toBeGreaterThanOrEqual(before);
  });

  it('quotes zero for no shares and leaves the odds alone', () => {
    expect(quoteSale(MARKET, 'YES', 0)).toMatchObject({
      proceeds: 0,
      averagePrice: 0,
      newYesPercent: pricePercent(MARKET.qYes, MARKET.qNo, MARKET.b),
    });
  });

  it('buying 50 coins of YES and selling every share at once returns at most 50', () => {
    for (const state of [{ qYes: 0, qNo: 0, b: 120 }, MARKET, { qYes: 300, qNo: 10, b: 80 }]) {
      const buy = quoteTrade(state, 'YES', 50);
      const after = { ...state, qYes: state.qYes + buy.shares };
      expect(quoteSale(after, 'YES', buy.shares).proceeds).toBeLessThanOrEqual(50);
    }
  });
});
