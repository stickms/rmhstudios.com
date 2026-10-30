import { describe, expect, it } from 'vitest';
import {
  CARD_MAX_PRICE,
  CARD_MIN_PRICE,
  checkAskingPrice,
  marketFee,
  sellerEligible,
} from '../market-rules';

describe('checkAskingPrice', () => {
  it('accepts a price inside the bounds', () => {
    expect(checkAskingPrice(CARD_MIN_PRICE, [])).toBe('ok');
    expect(checkAskingPrice(CARD_MAX_PRICE, [])).toBe('ok');
  });

  it('rejects fractions, too low and too high', () => {
    expect(checkAskingPrice(12.5, [])).toBe('not-integer');
    expect(checkAskingPrice(CARD_MIN_PRICE - 1, [])).toBe('too-low');
    expect(checkAskingPrice(CARD_MAX_PRICE + 1, [])).toBe('too-high');
  });

  it('refuses ten times the recent median once there are three sales', () => {
    expect(checkAskingPrice(1000, [100, 100, 100])).toBe('far-above-market');
    expect(checkAskingPrice(999, [100, 100, 100])).toBe('ok');
  });

  it('does not guard on too little history', () => {
    expect(checkAskingPrice(1000, [100, 100])).toBe('ok');
  });
});

describe('marketFee', () => {
  it('always burns at least a coin at the minimum price', () => {
    expect(marketFee(CARD_MIN_PRICE).fee).toBeGreaterThanOrEqual(1);
  });

  it('splits exactly: proceeds + fee = price', () => {
    for (const p of [10, 11, 99, 100, 1234, 5000]) {
      const s = marketFee(p);
      expect(s.fee + s.proceeds).toBe(p);
      expect(s.fee).toBeLessThanOrEqual(Math.ceil(p * 0.1));
    }
  });
});

describe('sellerEligible', () => {
  it('needs both the level and the account age', () => {
    expect(sellerEligible({ level: 3, accountAgeDays: 7 })).toBe(true);
    expect(sellerEligible({ level: 2, accountAgeDays: 30 })).toBe(false);
    expect(sellerEligible({ level: 10, accountAgeDays: 6.9 })).toBe(false);
  });
});
