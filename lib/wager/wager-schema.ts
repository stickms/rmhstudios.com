import { z } from 'zod';
import {
  MAX_WAGER_STAKE,
  MIN_WAGER_STAKE,
  WAGER_MAX_EXPIRY_MS,
  WAGER_MIN_EXPIRY_MS,
} from './constants';
import { WAGER_ELIGIBLE_GAME_IDS } from './eligible-games';

export const createWagerSchema = z.object({
  gameId: z.enum(WAGER_ELIGIBLE_GAME_IDS),
  stakeCoins: z.number().int().min(MIN_WAGER_STAKE).max(MAX_WAGER_STAKE),
  // null / omitted = an open challenge anyone may accept.
  opponentId: z.string().min(1).max(64).nullish(),
  expiresInMs: z
    .number()
    .int()
    .min(WAGER_MIN_EXPIRY_MS)
    .max(WAGER_MAX_EXPIRY_MS)
    .optional(),
});
export type CreateWagerInput = z.infer<typeof createWagerSchema>;

export const reportWagerSchema = z.object({
  // The user id the reporter claims won (must be a participant).
  winnerId: z.string().min(1).max(64),
});
export type ReportWagerInput = z.infer<typeof reportWagerSchema>;

// Admin adjudication: pick a winner, or void (refund both).
export const adjudicateWagerSchema = z.object({
  winnerId: z.string().min(1).max(64).nullable(),
  note: z.string().max(500).optional(),
});
export type AdjudicateWagerInput = z.infer<typeof adjudicateWagerSchema>;
