import { z } from 'zod';

import { MIN_REDEMPTION_COINS, redemptionKinds } from './redemption';

// zod for the creator coin → value bridge. The constants and `redemptionCost`
// live in `./redemption` (zod-free, for the earnings tab) and are re-exported.
export * from './redemption';

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
