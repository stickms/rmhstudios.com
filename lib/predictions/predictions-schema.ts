import { z } from 'zod';

export const MAX_PREDICTION_TITLE = 160;
export const MAX_PREDICTION_DESCRIPTION = 1000;

/** Min/max coins a single trade can stake. */
export const MIN_TRADE_AMOUNT = 1;
export const MAX_TRADE_AMOUNT = 100_000;

export const createPredictionSchema = z.object({
  title: z.string().trim().min(8).max(MAX_PREDICTION_TITLE),
  description: z.string().trim().max(MAX_PREDICTION_DESCRIPTION).optional(),
  // Optional trading deadline (ISO). Must be in the future when set.
  closesAt: z.string().datetime().nullable().optional(),
});

/** `GET /api/predictions?filter=` — `open` (default), `resolved` or `mine`. */
export const predictionListQuery = z.object({
  filter: z.string().optional(),
});

export const tradeSchema = z.object({
  side: z.enum(['YES', 'NO']),
  amount: z.number().int().min(MIN_TRADE_AMOUNT).max(MAX_TRADE_AMOUNT),
  /** The quote less its allowance; a buy that would land below it is refused. */
  minShares: z.number().finite().positive().optional(),
});

/**
 * Selling shares back. `key` makes a retry a no-op; it is at most 36 characters
 * so the ledger key `prediction-sale:<market>:<member>:<key>` fits its 128-character column.
 */
export const sellSchema = z.object({
  side: z.enum(['YES', 'NO']),
  shares: z.number().finite().positive(),
  minProceeds: z.number().int().min(0),
  key: z
    .string()
    .min(8)
    .max(36)
    .regex(/^[A-Za-z0-9_-]+$/),
});

export const resolveSchema = z.object({
  outcome: z.enum(['YES', 'NO']),
});

export const moderateSchema = z.object({
  action: z.enum(['approve', 'deny']),
});

export type CreatePredictionInput = z.infer<typeof createPredictionSchema>;
export type TradeInput = z.infer<typeof tradeSchema>;
export type SellInput = z.infer<typeof sellSchema>;
export type ResolveInput = z.infer<typeof resolveSchema>;
export type ModerateInput = z.infer<typeof moderateSchema>;
