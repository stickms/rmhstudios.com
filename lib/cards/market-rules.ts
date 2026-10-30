/**
 * The card market's rules as pure functions: price bounds, the fee split and the
 * fat-finger guard. Client-safe. The economics (fee, gates) are the shop
 * marketplace's, imported rather than restated; see
 * docs/superpowers/specs/2026-10-30-card-market-design.md.
 */

import {
  MARKET_FEE_BPS,
  MIN_ACCOUNT_AGE_DAYS,
  MIN_SELLER_LEVEL,
  isAnomalousPrice,
  marketFee,
} from '@/lib/market/tradable';

export { MARKET_FEE_BPS, MIN_ACCOUNT_AGE_DAYS, MIN_SELLER_LEVEL, marketFee };

/** Ten keeps the burned fee (10%, rounded down) at one coin or more. */
export const CARD_MIN_PRICE = 10;
export const CARD_MAX_PRICE = 5000;
export const MAX_CARD_LISTINGS = 25;

export type PriceCheck = 'ok' | 'not-integer' | 'too-low' | 'too-high' | 'far-above-market';

/** Whether an asking price may be listed, given the recent sale prices of that card. */
export function checkAskingPrice(price: number, recentSoldPrices: readonly number[]): PriceCheck {
  if (!Number.isInteger(price)) return 'not-integer';
  if (price < CARD_MIN_PRICE) return 'too-low';
  if (price > CARD_MAX_PRICE) return 'too-high';
  if (isAnomalousPrice(price, recentSoldPrices)) return 'far-above-market';
  return 'ok';
}

/** Whether a seller may list at all (the shop market's account gates). */
export function sellerEligible(input: { level: number; accountAgeDays: number }): boolean {
  return input.level >= MIN_SELLER_LEVEL && input.accountAgeDays >= MIN_ACCOUNT_AGE_DAYS;
}
