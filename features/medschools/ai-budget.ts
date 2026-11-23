/**
 * The monthly AI budget split (phase 6, R10, R11). `MEDSCHOOLS_AI_MONTHLY_USD` is one cap shared by the scrape
 * (extraction, the Admit forums) and the member-facing Q&A. Q&A reserves `MEDSCHOOLS_QA_AI_SHARE` of it (default 25%) and
 * the scrape gates are handed the rest as their cap, so the two can never pass the cap together and neither can starve the
 * other. Unspent Q&A budget does not flow to the scrape: a fixed split is the only one whose worst case is knowable.
 *
 * Pure and imported by the worker and the web tier; imports nothing.
 */

/** `AiUsage.task` of every Q&A call (route and answer), the budget's unit. */
export const QA_TASK = 'medschools-qa';
/**
 * `AiUsage.promptId` of the reservation row written (zero tokens, zero cost) under a per-member advisory lock BEFORE any
 * model call: one per question, so it is the per-member daily count, atomic across processes and independent of whether
 * the provider's own metering write succeeds (plan R18).
 */
export const QA_ASK_PROMPT_ID = 'medschools-qa-ask';
/** `AiUsage.promptId` of the in-flight lease: written with the reservation, deleted when the question ends. */
export const QA_LOCK_PROMPT_ID = 'medschools-qa-lock';
/** The lease outlives the deadline, so a crashed process frees the member after a minute. */
export const QA_LEASE_MS = 60_000;
/** The whole question (route call, retrieval, answer call) ends by this; it is under the client's `AI_TIMEOUT_MS` (60 s). */
export const QA_DEADLINE_MS = 50_000;
export const DEFAULT_QA_SHARE = 0.25;
/** Free members' questions per UTC day (R19). The approved and member tiers have their own, below. */
export const DEFAULT_QA_DAILY_CAP = 25;

/**
 * Limit tiers (R19). `admin` has no daily limit at all; the other three are caps per UTC day, each from its own env var.
 * Highest wins: admin, then member (a paying membership, automatic), then approved (an admin granted a limit request),
 * then free.
 */
export type QaTier = 'free' | 'approved' | 'member' | 'admin';
export type CappedQaTier = Exclude<QaTier, 'admin'>;
export const QA_TIER_ENV: Record<CappedQaTier, string> = {
  free: 'MEDSCHOOLS_QA_DAILY_CAP',
  approved: 'MEDSCHOOLS_QA_DAILY_CAP_APPROVED',
  member: 'MEDSCHOOLS_QA_DAILY_CAP_MEMBER',
};
export const DEFAULT_QA_TIER_CAPS: Record<CappedQaTier, number> = { free: DEFAULT_QA_DAILY_CAP, approved: 40, member: 100 };
/** After a declined (or revoked) request the member cannot ask again for this long. */
export const QA_LIMIT_REQUEST_COOLDOWN_DAYS = 30;
/** The applicant's optional reason, and an admin's optional reply. */
export const QA_LIMIT_NOTE_MAX = 500;

const blank = (env: string | undefined): boolean => env === undefined || env.trim() === '';

/**
 * Q&A's fraction of the monthly cap. Unset or blank: 0.25. Present but not a number in [0, 1] is a typo about money:
 * it fails closed to 0 (which pauses Q&A and never the scrape) and `warn` says so.
 */
export function qaShare(env: string | undefined, warn?: (line: string) => void): number {
  if (blank(env)) return DEFAULT_QA_SHARE;
  const n = Number(env);
  if (Number.isFinite(n) && n >= 0 && n <= 1) return n;
  warn?.('MEDSCHOOLS_QA_AI_SHARE is not a number from 0 to 1; Q&A is paused (share 0) until it is fixed');
  return 0;
}

/**
 * Questions per UTC day for a capped tier. Unset or blank: the tier's default (25, 40, 100). Present but not a
 * non-negative integer: 0 (fail closed) and `warn`, so a typo closes Q&A for that tier rather than opening it.
 */
export function qaTierCap(tier: CappedQaTier, env: string | undefined, warn?: (line: string) => void): number {
  if (blank(env)) return DEFAULT_QA_TIER_CAPS[tier];
  const n = Number(env);
  if (Number.isInteger(n) && n >= 0) return n;
  warn?.(`${QA_TIER_ENV[tier]} is not a non-negative integer; Q&A is paused for this tier (cap 0) until it is fixed`);
  return 0;
}

/** The free tier's cap (`MEDSCHOOLS_QA_DAILY_CAP`). */
export function qaDailyCap(env: string | undefined, warn?: (line: string) => void): number {
  return qaTierCap('free', env, warn);
}

/** The daily cap of any tier read from the environment; `null` for an admin (no daily limit). */
export function qaCapForTier(
  tier: QaTier,
  env: Record<string, string | undefined>,
  warn?: (line: string) => void,
): number | null {
  if (tier === 'admin') return null;
  return qaTierCap(tier, env[QA_TIER_ENV[tier]], warn);
}

/** What Q&A may spend in a UTC month. */
export function qaCapUsd(totalCapUsd: number, share: number): number {
  return totalCapUsd * share;
}

/** The cap the scrape gates are given: what Q&A did not reserve. */
export function scrapeCapUsd(totalCapUsd: number, share: number): number {
  return totalCapUsd * (1 - share);
}

/** 00:00 UTC of `now`'s day. */
export function utcDayStart(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}
