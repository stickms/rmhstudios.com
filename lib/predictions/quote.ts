/**
 * Client-safe quotes for a Predictions trade. Pure: it uses the same LMSR
 * functions the server prices with, so the number shown under the amount is the
 * number the server computes for the same market state. No Prisma, no zod.
 */
import { costToBuyShares, pricePercent, proceedsForShares, sharesForBudget, type Side } from './lmsr';

/** The public market state a quote needs. */
export interface MarketState {
  qYes: number;
  qNo: number;
  b: number;
}

/** A buy may land at most this far below its quote before the server refuses it. */
export const MIN_SHARES_SLIPPAGE = 0.02;

export interface BuyQuote {
  shares: number;
  cost: number;
  /** Coins per share, `amount / shares`. */
  averagePrice: number;
  /** YES chance (1..99) after the trade. */
  newYesPercent: number;
  /** The `minShares` to send: the quote less the slippage allowance. */
  minShares: number;
}

/** Estimate (without trading) how a coin `amount` would land on a market. */
export function quoteTrade(market: MarketState, side: Side, amount: number): BuyQuote {
  const shares = sharesForBudget(market.qYes, market.qNo, market.b, side, amount);
  if (!Number.isFinite(shares) || shares <= 0) {
    return {
      shares: 0,
      cost: 0,
      averagePrice: 0,
      newYesPercent: pricePercent(market.qYes, market.qNo, market.b),
      minShares: 0,
    };
  }
  const cost = costToBuyShares(market.qYes, market.qNo, market.b, side, shares);
  const qYes = market.qYes + (side === 'YES' ? shares : 0);
  const qNo = market.qNo + (side === 'NO' ? shares : 0);
  return {
    shares,
    cost,
    averagePrice: amount / shares,
    newYesPercent: pricePercent(qYes, qNo, market.b),
    minShares: shares * (1 - MIN_SHARES_SLIPPAGE),
  };
}

export interface SaleQuote {
  /** Whole coins, rounded down. */
  proceeds: number;
  averagePrice: number;
  newYesPercent: number;
  /** The `minProceeds` to send: the quote less the slippage allowance, rounded down. */
  minProceeds: number;
}

/** Estimate (without selling) what `shares` of `side` would return. */
export function quoteSale(market: MarketState, side: Side, shares: number): SaleQuote {
  const proceeds = proceedsForShares(market.qYes, market.qNo, market.b, side, shares);
  const qYes = market.qYes - (side === 'YES' ? shares : 0);
  const qNo = market.qNo - (side === 'NO' ? shares : 0);
  return {
    proceeds,
    averagePrice: shares > 0 ? proceeds / shares : 0,
    newYesPercent: shares > 0 ? pricePercent(qYes, qNo, market.b) : pricePercent(market.qYes, market.qNo, market.b),
    minProceeds: Math.floor(proceeds * (1 - MIN_SHARES_SLIPPAGE)),
  };
}
