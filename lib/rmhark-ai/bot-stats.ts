/**
 * Bot-worker settings contract + pacing estimate — pure, safe anywhere.
 *
 * The Go bot-worker (go-services/internal/botworker) owns the behaviour; this
 * file mirrors the two pieces of it the admin page needs: the bounds of each
 * admin knob (settings.go `clamp`) and the per-bot posting rate
 * (worker.go `habitPostsPerDay` / `shouldPost`). Keep them in step.
 */

import { POSTING_HABITS } from './persona';

/** The five knobs an admin sets on /admin/bots. */
export interface BotWorkerSettingsInput {
  /** Pool size the worker tops up to. Lowering it never deletes bots. */
  targetBotCount: number;
  /** Bots minted per top-up pass. */
  createBatch: number;
  /** Minutes between top-up passes. */
  createIntervalMin: number;
  /** Scales every bot's posts/day; 0 pauses posting. */
  postRateMultiplier: number;
  /** Cap on posts created in one tick. */
  maxPostsPerTick: number;
}

/** Inclusive bounds — identical to the Go worker's clamp. */
export const BOT_SETTINGS_BOUNDS = {
  targetBotCount: { min: 0, max: 1000 },
  createBatch: { min: 1, max: 50 },
  createIntervalMin: { min: 5, max: 1440 },
  postRateMultiplier: { min: 0, max: 10 },
  maxPostsPerTick: { min: 1, max: 60 },
} as const satisfies Record<keyof BotWorkerSettingsInput, { min: number; max: number }>;

/** The worker's built-in defaults (types.go), used until an admin saves. */
export const DEFAULT_BOT_SETTINGS: BotWorkerSettingsInput = {
  targetBotCount: 20,
  createBatch: 6,
  createIntervalMin: 120,
  postRateMultiplier: 1,
  maxPostsPerTick: 5,
};

/** The worker's post tick (BOT_POST_TICK_MS default). */
export const BOT_POST_TICK_MINUTES = 5;

const DEFAULT_POSTS_PER_DAY = 5;

/**
 * A bot's base posts/day from its persona, as the worker derives it: match the
 * ACTIVITY line (or, for legacy personas, the whole text) against the habit
 * labels. Unmatched personas default to 5/day.
 */
export function habitPostsPerDay(persona: string | null | undefined): number {
  const text = persona ?? '';
  const activity = text.split('\n').find((line) => line.startsWith('ACTIVITY:')) ?? text;
  const lower = activity.toLowerCase();
  // Same precedence as the Go switch: chatty, lurker, bursty, then default.
  if (/very online|frequently/.test(lower)) return 9;
  if (/rare poster|only chimes in/.test(lower)) return 2;
  if (/flurry|goes quiet/.test(lower)) return 6;
  return DEFAULT_POSTS_PER_DAY;
}

/** Habit ids by rate, for the admin page's pool breakdown. */
export function habitIdForRate(perDay: number): string {
  return POSTING_HABITS.find((h) => h.postsPerDay === perDay)?.id ?? 'steady';
}

export interface PostingEstimate {
  /** Expected bot posts/day if the per-tick cap never bit. */
  demandPerDay: number;
  /** The hard ceiling the per-tick cap allows. */
  capacityPerDay: number;
  /** What will actually be posted: min(demand, capacity). */
  expectedPerDay: number;
  /** True when the per-tick cap is throttling posting. */
  capped: boolean;
}

/** Sum of every bot's base posts/day (at a ×1 multiplier). */
export function basePostsPerDay(personas: ReadonlyArray<string | null>): number {
  return personas.reduce((sum, p) => sum + habitPostsPerDay(p), 0);
}

/**
 * Expected bot posts/day for a pool whose base rate (×1) is `basePerDay`.
 * Ignores the minimum-gap rule (it trims a few percent) and the posts replies
 * suppress via botLastPostAt, so treat it as an upper-bound estimate.
 */
export function projectPosting(
  basePerDay: number,
  settings: Pick<BotWorkerSettingsInput, 'postRateMultiplier' | 'maxPostsPerTick'>,
  tickMinutes: number = BOT_POST_TICK_MINUTES,
): PostingEstimate {
  const demandPerDay = basePerDay * settings.postRateMultiplier;
  const capacityPerDay = settings.maxPostsPerTick * ((24 * 60) / tickMinutes);
  return {
    demandPerDay,
    capacityPerDay,
    expectedPerDay: Math.min(demandPerDay, capacityPerDay),
    // Per-tick arrivals are bursty, so the cap starts dropping posts a little
    // before average demand reaches it.
    capped: demandPerDay > capacityPerDay * 0.8,
  };
}

/** Average posts/day of a freshly rolled bot (habits are picked uniformly). */
export const AVERAGE_HABIT_POSTS_PER_DAY =
  POSTING_HABITS.reduce((sum, h) => sum + h.postsPerDay, 0) / POSTING_HABITS.length;

/** Bots minted per hour while the pool is below target. */
export function botsMintedPerHour(
  settings: Pick<BotWorkerSettingsInput, 'createBatch' | 'createIntervalMin'>,
): number {
  return settings.createBatch * (60 / settings.createIntervalMin);
}
