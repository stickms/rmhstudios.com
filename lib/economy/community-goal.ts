/**
 * Community goal pots (C5) — client-safe schema, status model, view types.
 *
 * Kickstarter's all-or-nothing, in coins: admins post a site-wide goal ("a new
 * theme if we pool 50,000 coins by Friday"), members pledge, and either the
 * target is met or every pledge goes back through the ledger.
 */
import { z } from 'zod';

export const COMMUNITY_GOAL_STATUSES = [
  'OPEN',
  'FUNDED',
  'FULFILLED',
  'REFUNDING',
  'REFUNDED',
] as const;
export type CommunityGoalStatus = (typeof COMMUNITY_GOAL_STATUSES)[number];

export const GOAL_MIN_TARGET = 100;
export const GOAL_MAX_TARGET = 10_000_000;
export const PLEDGE_MAX = 1_000_000;

export const createCommunityGoalSchema = z.object({
  title: z.string().trim().min(3).max(120),
  description: z.string().trim().max(600).default(''),
  unlock: z.string().trim().min(2).max(160),
  targetCoins: z.number().int().min(GOAL_MIN_TARGET).max(GOAL_MAX_TARGET),
  /** ISO datetime; must be in the future (checked server-side against its own clock). */
  deadline: z.string().datetime(),
});
export type CreateCommunityGoalInput = z.infer<typeof createCommunityGoalSchema>;

export const pledgeSchema = z.object({
  coins: z.number().int().min(1).max(PLEDGE_MAX),
});

export const goalActionSchema = z.object({
  action: z.enum(['cancel', 'fulfil']),
});

export interface CommunityGoalView {
  id: string;
  title: string;
  description: string;
  unlock: string;
  targetCoins: number;
  raisedCoins: number;
  deadline: string;
  status: CommunityGoalStatus;
  /** Distinct members who pledged. */
  pledgers: number;
  /** Coins the viewer has pledged (un-refunded). */
  myPledge: number;
  /** Coins the viewer was refunded. */
  myRefunded: number;
}

/**
 * Whether a goal still accepts pledges at `now`. The database's conditional
 * update is the authority; this mirrors it so the UI can disable the button.
 */
export function acceptsPledges(
  g: Pick<CommunityGoalView, 'status' | 'deadline' | 'raisedCoins' | 'targetCoins'>,
  now: Date,
): boolean {
  return (
    g.status === 'OPEN' &&
    new Date(g.deadline).getTime() > now.getTime() &&
    g.raisedCoins < g.targetCoins
  );
}
