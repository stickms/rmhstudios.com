import { z } from 'zod';

// Client-safe constants + zod for the creator coin → value bridge.

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

export const requestRedemptionSchema = z
  .object({
    kind: z.enum(redemptionKinds),
    // SUB_CREDIT:
    tier: z.enum(['starter', 'pro']).optional(),
    months: z.number().int().min(1).max(12).optional(),
    // MERCH / PAYOUT:
    amountCoins: z.number().int().min(MIN_REDEMPTION_COINS).max(5_000_000).optional(),
    note: z.string().max(500).optional(),
  })
  .refine(
    (v) => v.kind !== 'SUB_CREDIT' || (v.tier != null && v.months != null),
    { message: 'Subscription credit needs a tier and month count' },
  )
  .refine(
    (v) => v.kind === 'SUB_CREDIT' || v.amountCoins != null,
    { message: 'An amount is required' },
  );
export type RequestRedemptionInput = z.infer<typeof requestRedemptionSchema>;

export const reviewRedemptionSchema = z.object({
  action: z.enum(['approve', 'reject', 'fulfill']),
  note: z.string().max(500).optional(),
  externalRef: z.string().max(120).optional(),
});
export type ReviewRedemptionInput = z.infer<typeof reviewRedemptionSchema>;

/** Coins burned for a given redemption request (server + client agree). */
export function redemptionCost(input: RequestRedemptionInput): number {
  if (input.kind === 'SUB_CREDIT') {
    return COINS_PER_SUB_MONTH[input.tier!] * (input.months ?? 1);
  }
  return input.amountCoins ?? 0;
}
