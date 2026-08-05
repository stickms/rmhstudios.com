/**
 * Group gifting and pooled purchases (F20) — the client-safe contract.
 *
 * A pool collects **escrowed** contributions toward a goal. "Escrowed" is the
 * whole design: the coins leave the contributor's balance the moment they chip
 * in (so nobody can pledge coins they then spend elsewhere), and they sit
 * outside circulation until one of exactly two things happens — the goal is met
 * and the pool settles to its target, or the deadline passes and every
 * contribution is returned.
 *
 * There is no third outcome. A pool that expires short of its goal and keeps
 * the coins is the fastest way to lose economy trust, which is why
 * `refundExpiredPools()` and its tests exist before the happy path does.
 *
 * The zod schemas live here (not in the `.server` module) so the API routes and
 * the client form validate against the same limits.
 */
import { z } from 'zod';

/**
 * What a pool is collecting for. A closed set — `targetId` means something
 * different for each, so a new purpose needs a settlement branch, not just a
 * new string.
 */
export const POOL_PURPOSES = ['membership-gift', 'tournament-prize', 'creator-tip'] as const;
export type PoolPurpose = (typeof POOL_PURPOSES)[number];

/** Purposes whose `targetId` is a user id that receives the coins on settle. */
export const USER_TARGET_PURPOSES: readonly PoolPurpose[] = ['membership-gift', 'creator-tip'];

/** Smallest useful contribution — below this the ledger row costs more than the coins. */
export const POOL_MIN_CONTRIBUTION = 10;
/** Blast-radius limit on a single contribution. */
export const POOL_MAX_CONTRIBUTION = 100_000;
/** Goal bounds. A pool nobody can fill is a refund job waiting to happen. */
export const POOL_MIN_GOAL = 50;
export const POOL_MAX_GOAL = 1_000_000;
/** How long a pool may stay open. Escrowed coins are out of circulation. */
export const POOL_MIN_DURATION_HOURS = 1;
export const POOL_MAX_DURATION_DAYS = 30;
/** Most open pools one user may run at once. */
export const POOL_MAX_OPEN_PER_USER = 5;

export const createPoolSchema = z.object({
  purpose: z.enum(POOL_PURPOSES),
  targetId: z.string().min(1).max(64).optional(),
  goalCoins: z.number().int().min(POOL_MIN_GOAL).max(POOL_MAX_GOAL),
  /** Hours from now until the pool expires. */
  durationHours: z
    .number()
    .int()
    .min(POOL_MIN_DURATION_HOURS)
    .max(POOL_MAX_DURATION_DAYS * 24),
});
export type CreatePoolInput = z.infer<typeof createPoolSchema>;

export const contributeSchema = z.object({
  coins: z.number().int().min(POOL_MIN_CONTRIBUTION).max(POOL_MAX_CONTRIBUTION),
});
export type ContributeInput = z.infer<typeof contributeSchema>;

/** Lifecycle state, derived rather than stored — see the schema comment on `Pool`. */
export type PoolState = 'open' | 'settled' | 'refunded' | 'expired';

export function poolState(pool: {
  settledAt: Date | string | null;
  refundedAt: Date | string | null;
  expiresAt: Date | string;
}, now: Date = new Date()): PoolState {
  if (pool.settledAt) return 'settled';
  if (pool.refundedAt) return 'refunded';
  // Expired but not yet swept — the sweep runs on a cron, so there is a window
  // where a pool is past its deadline and the coins are still escrowed. The UI
  // must say "refund pending", never "open".
  return new Date(pool.expiresAt).getTime() <= now.getTime() ? 'expired' : 'open';
}

export interface PoolContributorView {
  userId: string;
  name: string | null;
  handle: string | null;
  coins: number;
  refunded: boolean;
}

export interface PoolView {
  id: string;
  creatorId: string;
  purpose: PoolPurpose;
  targetId: string | null;
  goalCoins: number;
  raised: number;
  expiresAt: string;
  state: PoolState;
  contributors: PoolContributorView[];
  /** What the viewer has escrowed in this pool (0 when signed out). */
  myContribution: number;
}

/** Percentage funded, clamped to 100 for the progress bar. */
export function poolProgress(raised: number, goalCoins: number): number {
  if (goalCoins <= 0) return 0;
  return Math.min(100, Math.round((raised / goalCoins) * 100));
}
