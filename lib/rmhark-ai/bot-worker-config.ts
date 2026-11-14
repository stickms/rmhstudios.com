/**
 * Bot-worker pacing, settings and pure decision logic (D3: ported from the Go
 * worker `internal/botworker`: types.go, settings.go and the pure parts of
 * worker.go). No Prisma, no I/O, safe anywhere; the jobs live in
 * `./bot-worker.server.ts`.
 *
 * Two layers of configuration, as before:
 *  1. `loadBotConfig`: process-lifetime knobs from the BOT_* environment (names
 *     unchanged, see .env.example). Every one falls back to the constants below.
 *  2. `BotSettings`: the five knobs admins tune on /admin/bots (the singleton
 *     `bot_worker_settings` row), re-read on every tick. Their bounds live in
 *     `bot-stats.ts` (`BOT_SETTINGS_BOUNDS`) and are applied by `clampSettings`.
 */

import { RESERVED_HANDLES } from '@/lib/handle';
import {
  BOT_SETTINGS_BOUNDS,
  DEFAULT_BOT_SETTINGS,
  habitPostsPerDay,
  type BotWorkerSettingsInput,
} from './bot-stats';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

// Built-in defaults (types.go).
export const POST_TICK_MS = 5 * MINUTE;
export const BOT_IMAGE_PROBABILITY = 0.05;
/** DeepSeek generations a post tick runs at once. */
export const GEN_CONCURRENCY = 4;
export const REPLY_LOOKBACK_MS = 12 * HOUR;
export const MAX_REPLIES_PER_TICK = 4;
export const MAX_REPLY_DEPTH = 6;
export const REACTIVE_HUMAN_PROB = 0.9;
export const BOT_TO_BOT_PROB = 0.3;
export const PROACTIVE_PROB = 0.4;
export const PROACTIVE_LOOKBACK_MS = 6 * HOUR;
export const DM_TICK_MS = 1 * MINUTE;
export const DM_LOOKBACK_MS = 1 * DAY;
export const MAX_DM_REPLIES_PER_TICK = 4;
export const REACTIVE_DM_PROB = 1.0;
export const DM_INITIATE_PROB = 0.15;
export const MAX_DM_OPENERS_PER_TICK = 1;
export const DM_FOLLOWUP_SILENCE_MS = 3 * DAY;
export const DM_ACTIVE_HUMAN_LOOKBACK_MS = 7 * DAY;
/** The model the bots use unless BOT_AI_MODEL says otherwise (not RMHARK_AI_MODEL / DEEPSEEK_MODEL). */
export const DEFAULT_BOT_MODEL = 'deepseek-flash';
export const AVATAR_CHANGE_DAYS = 60;
export const BANNER_CHANGE_DAYS = 90;
export const BIO_CHANGE_DAYS = 45;
export const NAME_CHANGE_DAYS = 180;
export const REFRESH_MAX_IMAGES_PER_TICK = 3;
export const LEGACY_UPGRADES_PER_TICK = 2;
/** The refresh run's cron: hourly, off the top of the hour. */
export const BOT_REFRESH_CRON = '23 * * * *';

export interface BotConfig {
  /** The admin knobs' values until an admin saves the row. */
  defaults: BotWorkerSettingsInput;
  postTickMs: number;
  replyTickMs: number;
  dmTickMs: number;
  genConcurrency: number;
  imageProb: number;
  replyLookbackMs: number;
  maxRepliesPerTick: number;
  maxReplyDepth: number;
  reactiveHumanProb: number;
  botToBotProb: number;
  proactiveProb: number;
  proactiveLookbackMs: number;
  dmLookbackMs: number;
  maxDmRepliesPerTick: number;
  reactiveDmProb: number;
  dmInitiateProb: number;
  maxDmOpenersPerTick: number;
  dmFollowupSilenceMs: number;
  dmActiveHumanLookbackMs: number;
  /** BOT_AI_MODEL. */
  model: string;
  /**
   * BOT_REACTIONS_ENABLED (default on): the kill switch for bots reacting to the live sitewide
   * announcement and to outside headlines (reaction posts and announcement-thread comments).
   * Off, bots post and reply exactly as before.
   */
  reactionsEnabled: boolean;
  /**
   * BOT_PROFILE_REFRESH (default on): the hourly `bot-worker.refresh` run that gives bots
   * online-sourced avatars and banners and lets their avatar, banner, bio and display name drift
   * (`./bot-look`). Off, the queue is still scheduled but every run is a no-op.
   */
  profileRefresh: boolean;
  /** Mean days between changes of each profile field (BOT_*_CHANGE_DAYS). */
  drift: { avatarDays: number; bannerDays: number; bioDays: number; nameDays: number };
  /** BOT_REFRESH_MAX_IMAGES_PER_TICK: stock-image fetches per refresh run (Openverse: 200/day anonymous). */
  refreshMaxImagesPerTick: number;
  /** Legacy DiceBear avatars upgraded per refresh run (counted inside the image cap). */
  legacyUpgradesPerTick: number;
}

export function clampInt(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export function clampProb(p: number): number {
  if (Number.isNaN(p) || p < 0) return 0;
  return p > 1 ? 1 : p;
}

/** Force every admin knob into its bounds, so a hand-edited row can never mint without limit or spin. */
export function clampSettings(s: BotWorkerSettingsInput): BotWorkerSettingsInput {
  const b = BOT_SETTINGS_BOUNDS;
  const mult = Number.isNaN(s.postRateMultiplier) ? 0 : s.postRateMultiplier;
  return {
    targetBotCount: clampInt(
      Math.trunc(s.targetBotCount),
      b.targetBotCount.min,
      b.targetBotCount.max,
    ),
    createBatch: clampInt(Math.trunc(s.createBatch), b.createBatch.min, b.createBatch.max),
    createIntervalMin: clampInt(
      Math.trunc(s.createIntervalMin),
      b.createIntervalMin.min,
      b.createIntervalMin.max,
    ),
    postRateMultiplier: Math.min(
      Math.max(mult, b.postRateMultiplier.min),
      b.postRateMultiplier.max,
    ),
    maxPostsPerTick: clampInt(
      Math.trunc(s.maxPostsPerTick),
      b.maxPostsPerTick.min,
      b.maxPostsPerTick.max,
    ),
  };
}

type Env = Readonly<Record<string, string | undefined>>;

// Same semantics as go-services/pkg/config: unset, empty or unparsable falls back.
function envInt(env: Env, key: string, fallback: number): number {
  const v = env[key];
  if (v === undefined || v === '' || !/^[+-]?\d+$/.test(v.trim())) return fallback;
  return Number.parseInt(v, 10);
}
function envFloat(env: Env, key: string, fallback: number): number {
  const v = env[key];
  if (v === undefined || v === '') return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}
/** A boolean switch: false/0/off/no (any case) turn it off; unset, empty or anything else keeps the fallback. */
function envBool(env: Env, key: string, fallback: boolean): boolean {
  const v = env[key]?.trim().toLowerCase();
  if (v === undefined || v === '') return fallback;
  if (['false', '0', 'off', 'no'].includes(v)) return false;
  if (['true', '1', 'on', 'yes'].includes(v)) return true;
  return fallback;
}
/** An integer millisecond count; non-positive values are ignored. */
function envMillis(env: Env, key: string, fallback: number): number {
  const n = envInt(env, key, 0);
  return n > 0 ? n : fallback;
}

/** Read the BOT_* environment. Variable names match .env.example and the retired Go worker. */
export function loadBotConfig(env: Env = process.env): BotConfig {
  const postTickMs = envMillis(env, 'BOT_POST_TICK_MS', POST_TICK_MS);
  return {
    defaults: clampSettings({
      targetBotCount: envInt(env, 'BOT_TARGET_COUNT', DEFAULT_BOT_SETTINGS.targetBotCount),
      createBatch: envInt(env, 'BOT_CREATE_BATCH', DEFAULT_BOT_SETTINGS.createBatch),
      createIntervalMin: Math.round(
        envMillis(env, 'BOT_USER_CHECK_MS', DEFAULT_BOT_SETTINGS.createIntervalMin * MINUTE) /
          MINUTE,
      ),
      postRateMultiplier: envFloat(
        env,
        'BOT_POST_RATE_MULTIPLIER',
        DEFAULT_BOT_SETTINGS.postRateMultiplier,
      ),
      maxPostsPerTick: envInt(env, 'BOT_MAX_POSTS_PER_TICK', DEFAULT_BOT_SETTINGS.maxPostsPerTick),
    }),
    postTickMs,
    replyTickMs: envMillis(env, 'BOT_REPLY_TICK_MS', postTickMs),
    dmTickMs: envMillis(env, 'BOT_DM_TICK_MS', DM_TICK_MS),
    genConcurrency: clampInt(envInt(env, 'BOT_GEN_CONCURRENCY', GEN_CONCURRENCY), 1, 16),
    imageProb: clampProb(envFloat(env, 'BOT_IMAGE_PROBABILITY', BOT_IMAGE_PROBABILITY)),
    replyLookbackMs: REPLY_LOOKBACK_MS,
    maxRepliesPerTick: envInt(env, 'BOT_MAX_REPLIES_PER_TICK', MAX_REPLIES_PER_TICK),
    maxReplyDepth: envInt(env, 'BOT_MAX_REPLY_DEPTH', MAX_REPLY_DEPTH),
    reactiveHumanProb: clampProb(envFloat(env, 'BOT_REACTIVE_HUMAN_PROB', REACTIVE_HUMAN_PROB)),
    botToBotProb: clampProb(envFloat(env, 'BOT_TO_BOT_REPLY_PROB', BOT_TO_BOT_PROB)),
    proactiveProb: clampProb(envFloat(env, 'BOT_PROACTIVE_PROB', PROACTIVE_PROB)),
    proactiveLookbackMs: PROACTIVE_LOOKBACK_MS,
    dmLookbackMs: envMillis(env, 'BOT_DM_LOOKBACK_MS', DM_LOOKBACK_MS),
    maxDmRepliesPerTick: envInt(env, 'BOT_MAX_DM_REPLIES_PER_TICK', MAX_DM_REPLIES_PER_TICK),
    reactiveDmProb: clampProb(envFloat(env, 'BOT_REACTIVE_DM_PROB', REACTIVE_DM_PROB)),
    dmInitiateProb: clampProb(envFloat(env, 'BOT_DM_INITIATE_PROB', DM_INITIATE_PROB)),
    maxDmOpenersPerTick: envInt(env, 'BOT_MAX_DM_OPENERS_PER_TICK', MAX_DM_OPENERS_PER_TICK),
    dmFollowupSilenceMs: envMillis(env, 'BOT_DM_FOLLOWUP_SILENCE_MS', DM_FOLLOWUP_SILENCE_MS),
    dmActiveHumanLookbackMs: envMillis(
      env,
      'BOT_DM_ACTIVE_HUMAN_LOOKBACK_MS',
      DM_ACTIVE_HUMAN_LOOKBACK_MS,
    ),
    model: env.BOT_AI_MODEL || DEFAULT_BOT_MODEL,
    reactionsEnabled: envBool(env, 'BOT_REACTIONS_ENABLED', true),
    profileRefresh: envBool(env, 'BOT_PROFILE_REFRESH', true),
    drift: {
      avatarDays: envFloat(env, 'BOT_AVATAR_CHANGE_DAYS', AVATAR_CHANGE_DAYS),
      bannerDays: envFloat(env, 'BOT_BANNER_CHANGE_DAYS', BANNER_CHANGE_DAYS),
      bioDays: envFloat(env, 'BOT_BIO_CHANGE_DAYS', BIO_CHANGE_DAYS),
      nameDays: envFloat(env, 'BOT_NAME_CHANGE_DAYS', NAME_CHANGE_DAYS),
    },
    refreshMaxImagesPerTick: clampInt(
      envInt(env, 'BOT_REFRESH_MAX_IMAGES_PER_TICK', REFRESH_MAX_IMAGES_PER_TICK),
      0,
      20,
    ),
    legacyUpgradesPerTick: LEGACY_UPGRADES_PER_TICK,
  };
}

// ─── pacing ─────────────────────────────────────────────────────────────────

export interface BotPacingRow {
  botPersona: string | null;
  botLastPostAt: Date | null;
}

/**
 * A per-day rate from the persona, scaled by the admin multiplier, then a
 * minimum gap since the bot's last post and a probabilistic draw (`rnd` is a
 * uniform [0,1) sample) so that on average perDay posts land across the day's ticks.
 */
export function shouldPost(
  bot: BotPacingRow,
  multiplier: number,
  tickMs: number,
  now: number,
  rnd: number,
): boolean {
  const perDay = habitPostsPerDay(bot.botPersona) * multiplier;
  if (perDay <= 0) return false;
  if (bot.botLastPostAt) {
    const minGap = DAY / (perDay * 2 + 1);
    if (now - bot.botLastPostAt.getTime() < minGap) return false;
  }
  const ticksPerDay = DAY / tickMs;
  return rnd < perDay / ticksPerDay;
}

/**
 * An expected count (0.4 x multiplier proactive replies per tick) as an integer
 * draw: the whole part always, plus one more with probability equal to the
 * fractional part. `rnd` is a uniform [0,1) sample.
 */
export function scaledCount(expected: number, rnd: number): number {
  if (expected <= 0) return 0;
  const whole = Math.floor(expected);
  return rnd < expected - whole ? whole + 1 : whole;
}

/**
 * Whether the pool should be topped up now: on the first pass, once the create
 * interval has elapsed, or when the settings row was saved since the last pass.
 */
export function maintenanceDue(
  now: number,
  lastRun: number | null,
  lastSave: number | null,
  settings: { createIntervalMin: number; updatedAt: Date | null },
): boolean {
  if (lastRun === null) return true;
  if (settings.updatedAt && settings.updatedAt.getTime() > (lastSave ?? 0)) return true;
  return now - lastRun >= settings.createIntervalMin * MINUTE;
}

// ─── handles ────────────────────────────────────────────────────────────────

/**
 * Lowercase and strip non-alphanumerics, then force the result to satisfy
 * HANDLE_REGEX (`^[a-z][a-z0-9_]{2,19}$`): the model happily returns "42coffee"
 * or "admin", which used to be inserted verbatim. Reserved names get a "bot"
 * suffix (the numeric collision suffix in `uniqueHandle` clears the rest).
 */
export function sanitizeHandle(h: string): string {
  let result = h.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (result === '' || result[0] < 'a' || result[0] > 'z') result = 'u' + result;
  if (result.length > 16) result = result.slice(0, 16);
  if (result.length < 4) result += 'user';
  if (RESERVED_HANDLES.has(result)) result += 'bot';
  return result;
}

/** Canonical participant ordering for the Conversation unique constraint. */
export function orderPair(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a];
}

// ─── schedules ──────────────────────────────────────────────────────────────

/**
 * The pg-boss cron for a tick interval. pg-boss cron has one-minute granularity
 * (the Go tickers could be sub-minute), so the interval is rounded to whole
 * minutes, at least 1; an hour or more becomes every N hours, capped at daily.
 */
export function cronForInterval(ms: number): string {
  const minutes = Math.max(1, Math.round(ms / MINUTE));
  if (minutes === 1) return '* * * * *';
  if (minutes < 60) return `*/${minutes} * * * *`;
  const hours = Math.min(24, Math.round(minutes / 60));
  return hours >= 24 ? '0 0 * * *' : hours === 1 ? '0 * * * *' : `0 */${hours} * * *`;
}

/** The interval the cron above actually runs at: what `shouldPost` must be told (it paces per tick). */
export function effectiveTickMs(ms: number): number {
  const minutes = Math.max(1, Math.round(ms / MINUTE));
  if (minutes < 60) return minutes * MINUTE;
  return Math.min(24, Math.round(minutes / 60)) * HOUR;
}
