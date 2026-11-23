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
/**
 * `AiUsage.promptId` of an admin's in-flight lease (R19): an admin has no daily cap and no one-at-a-time rule, but at
 * most `QA_ADMIN_MAX_IN_FLIGHT` of these per admin exist at once, so parallel questions cannot all pass the shared
 * monthly pause before any spend is metered. Written under a lock keyed on the admin; deleted when the question ends.
 */
export const QA_ADMIN_LOCK_PROMPT_ID = 'medschools-qa-admin-lock';
export const QA_ADMIN_MAX_IN_FLIGHT = 3;
/** The whole question (route call, retrieval, answer call) ends by this; it is under the client's `AI_TIMEOUT_MS` (60 s). */
export const QA_DEADLINE_MS = 50_000;
/**
 * The same, for a question the member asked to think through (R20): the whole question ends by this, and the answer call
 * gets whatever the route call and retrieval left. The client's per-call timeout for that endpoint stays above it
 * (`QA_THINK_CLIENT_TIMEOUT_MS`).
 */
export const QA_THINK_DEADLINE_MS = 120_000;
/** The client's timeout for a thinking question: above `QA_THINK_DEADLINE_MS`, so the server's refusal arrives first. */
export const QA_THINK_CLIENT_TIMEOUT_MS = 135_000;
/** How far past the longest deadline the in-flight lease runs, for a clock or a pause the deadline did not see. */
export const QA_LEASE_MARGIN_MS = 30_000;
/**
 * The in-flight lease (member and admin) outlives the longest a question can run, so a live thinking question is never
 * counted as gone; a crashed process frees the member after this long.
 */
export const QA_LEASE_MS = QA_THINK_DEADLINE_MS + QA_LEASE_MARGIN_MS;

/** The whole-question deadline of a question, by whether it thinks. */
export const qaDeadlineMs = (think: boolean): number => (think ? QA_THINK_DEADLINE_MS : QA_DEADLINE_MS);

/**
 * `MEDSCHOOLS_QA_THINKING`: whether members may ask for DeepSeek's reasoning mode (R20). Unset or blank is on; `on` and
 * `off` (any case) are themselves; anything else is a typo about money and means off, with `warn` saying so.
 */
export function qaThinkingEnabled(env: string | undefined, warn?: (line: string) => void): boolean {
  if (blank(env)) return true;
  const v = (env ?? '').trim().toLowerCase();
  if (v === 'on') return true;
  if (v === 'off') return false;
  warn?.('MEDSCHOOLS_QA_THINKING is neither on nor off; thinking is off until it is fixed');
  return false;
}
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
