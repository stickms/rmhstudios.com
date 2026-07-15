import { z } from 'zod';
import { WAGER_ELIGIBLE_GAME_IDS } from '@/lib/wager/eligible-games';
import {
  MAX_TOURNAMENT_ENTRY_FEE,
  MAX_TOURNAMENT_PLAYERS,
  MAX_TOURNAMENT_SEED,
  MIN_TOURNAMENT_PLAYERS,
} from '@/lib/wager/constants';

export const createTournamentSchema = z.object({
  name: z.string().min(3).max(120),
  gameId: z.enum(WAGER_ELIGIBLE_GAME_IDS),
  format: z.enum(['SINGLE_ELIM', 'ROUND_ROBIN']),
  entryFeeCoins: z.number().int().min(0).max(MAX_TOURNAMENT_ENTRY_FEE),
  seedPoolCoins: z.number().int().min(0).max(MAX_TOURNAMENT_SEED).optional(),
  maxPlayers: z.number().int().min(MIN_TOURNAMENT_PLAYERS).max(MAX_TOURNAMENT_PLAYERS),
  startsAt: z.string().datetime().nullable().optional(),
});
export type CreateTournamentInput = z.infer<typeof createTournamentSchema>;

export const reportMatchSchema = z.object({
  winnerEntrantId: z.string().min(1).max(64),
});
export type ReportMatchInput = z.infer<typeof reportMatchSchema>;
