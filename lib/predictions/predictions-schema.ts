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

export const tradeSchema = z.object({
  side: z.enum(['YES', 'NO']),
  amount: z.number().int().min(MIN_TRADE_AMOUNT).max(MAX_TRADE_AMOUNT),
});

export const resolveSchema = z.object({
  outcome: z.enum(['YES', 'NO']),
});

export const moderateSchema = z.object({
  action: z.enum(['approve', 'deny']),
});

export type CreatePredictionInput = z.infer<typeof createPredictionSchema>;
export type TradeInput = z.infer<typeof tradeSchema>;
export type ResolveInput = z.infer<typeof resolveSchema>;
export type ModerateInput = z.infer<typeof moderateSchema>;
