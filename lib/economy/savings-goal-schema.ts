/**
 * Savings goals (C1) — client-safe schema and view types. The projection math
 * lives in `savings-goal.ts`; persistence in `savings-goal.server.ts`.
 */
import { z } from 'zod';
import type { Projection } from '@/lib/economy/savings-goal';

export const SAVINGS_GOAL_MAX = 5;
export const SAVINGS_CUSTOM_MAX = 1_000_000;

export const createSavingsGoalSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('shop_item'), itemId: z.string().min(1).max(64) }),
  z.object({ kind: z.literal('market_cosmetic'), itemId: z.string().min(1).max(64) }),
  z.object({
    kind: z.literal('custom'),
    title: z.string().trim().min(1).max(80),
    targetCoins: z.number().int().min(1).max(SAVINGS_CUSTOM_MAX),
  }),
]);

export type CreateSavingsGoalInput = z.infer<typeof createSavingsGoalSchema>;

export interface SavingsGoalView {
  id: string;
  kind: 'shop_item' | 'market_cosmetic' | 'custom';
  itemId: string | null;
  title: string;
  targetCoins: number;
  /** 0–1, for the ring. */
  progress: number;
  projection: Projection;
  /** ISO date (UTC) of the projected arrival, when on track. */
  etaDate: string | null;
}

export interface SavingsGoalsPayload {
  balance: number;
  goals: SavingsGoalView[];
  max: number;
}
