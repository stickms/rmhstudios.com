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
/** `AiUsage.promptId` of the route call: every question makes exactly one, so it is the per-user daily count. */
export const QA_ROUTE_PROMPT_ID = 'medschools-qa-route';
export const DEFAULT_QA_SHARE = 0.25;
export const DEFAULT_QA_DAILY_CAP = 15;

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

/** Questions per member per UTC day. Unset or blank: 15. Present but not a non-negative integer: 0 (fail closed) and `warn`. */
export function qaDailyCap(env: string | undefined, warn?: (line: string) => void): number {
  if (blank(env)) return DEFAULT_QA_DAILY_CAP;
  const n = Number(env);
  if (Number.isInteger(n) && n >= 0) return n;
  warn?.('MEDSCHOOLS_QA_DAILY_CAP is not a non-negative integer; Q&A is paused (cap 0) until it is fixed');
  return 0;
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
