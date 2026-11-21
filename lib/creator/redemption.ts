/**
 * Creator coin → value bridge — the client-safe constants and the cost rule.
 * zod-free, so the creator-studio earnings tab does not load zod; the request
 * and review schemas are in `./redemption-schema`, which re-exports this.
 */
import type { RequestRedemptionInput } from './redemption-schema';

/** Coins burned per one month of subscription credit, by tier. */
export const COINS_PER_SUB_MONTH: Record<'starter' | 'pro', number> = {
  starter: 5_000,
  pro: 12_000,
};

/** Minimum coins for any redemption. */
export const MIN_REDEMPTION_COINS = 500;
/** Payouts (cash) are gated behind a higher floor + verified-creator status. */
export const MIN_PAYOUT_COINS = 50_000;
/** Indicative fiat value of a coin for merch/payout display (cents per 1000 coins). */
export const CENTS_PER_1000_COINS = 100; // 1000 coins ≈ $1.00 (policy lever)

export const redemptionKinds = ['SUB_CREDIT', 'MERCH', 'PAYOUT'] as const;

/** Coins burned for a given redemption request (server + client agree). */
export function redemptionCost(input: RequestRedemptionInput): number {
  if (input.kind === 'SUB_CREDIT') {
    return COINS_PER_SUB_MONTH[input.tier!] * (input.months ?? 1);
  }
  return input.amountCoins ?? 0;
}
