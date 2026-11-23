/** Politeness and identity config for every external data source the RMH Med Schools scraper talks to. */
/**
 * One static, honest agent for every host (owner 2026-11-23): the name and address the sources' admins know. It carries
 * no site URL, so a source cannot send traffic back by following it. Not a browser string. robots.txt matching
 * (`isPathAllowed`) uses it: a group naming `MarlonJack` applies, otherwise the `*` group.
 */
export const MEDSCHOOLS_USER_AGENT = 'MarlonJack/1.0 (contact: admin@rmhstudios.com)';

export interface SourceConfig {
  origin: string;
  userAgent: string;
  /** Minimum gap between requests on the hourly job. */
  spacingMs: number;
  /** Minimum gap between requests while backfilling. */
  backfillSpacingMs: number;
  /** Random extra gap, 0 to this many ms, added to every spacing on the live path (default 0: none). */
  jitterMs?: number;
  /** Same, for sessions that take `backfillSpacingMs` (default: `jitterMs`). */
  backfillJitterMs?: number;
  maxConsecutiveFailures: number;
  maxRetries: number;
  retryAfterCapMs: number;
  timeoutMs: number;
  /** Extra request headers sent with every request to this source. */
  headers?: Record<string, string>;
}

/** Path of the one GraphQL endpoint on the Admit API origin. */
export const ADMIT_GRAPHQL_PATH = '/graphql';

/**
 * Public school-page URL on med.admit.org for an alias key. Deliberately undefined: the page pattern is not recorded
 * anywhere in the repo and must be read off the live site (phase 3 plan, Facts 1) before it is invented here.
 * `buildSourceLinks` emits no Admit link while this is undefined.
 */
export const ADMIT_SCHOOL_URL: ((aliasKey: string) => string) | undefined = undefined;

/**
 * Admit's public secondary-essays page for an alias key (secondaries tab). The path comes from the endpoint inventory
 * (`/secondary-essays/<slug>`); that the slug equals the Admit alias key is UNVERIFIED (secondaries plan, Facts 1).
 */
export const ADMIT_SECONDARY_URL = (slug: string): string => `${SOURCES.ADMIT_WEB.origin}/secondary-essays/${slug}`;

export const SOURCES: {
  CYCLETRACK: SourceConfig;
  ADMIT: SourceConfig;
  ADMIT_WEB: SourceConfig;
  SDN_FORUMS: SourceConfig;
  SDN_WWW: SourceConfig;
} = {
  CYCLETRACK: {
    origin: 'https://cycletrack.org',
    userAgent: MEDSCHOOLS_USER_AGENT,
    spacingMs: 1000,
    backfillSpacingMs: 2000,
    maxConsecutiveFailures: 3,
    maxRetries: 3,
    retryAfterCapMs: 120_000,
    timeoutMs: 15_000,
  },
  ADMIT: {
    origin: 'https://api.admit.org',
    userAgent: MEDSCHOOLS_USER_AGENT,
    spacingMs: 1000,
    // The profile-history backfill (owner 2026-11-23): at least 3 s between requests plus 0-1 s of jitter.
    backfillSpacingMs: 3000,
    backfillJitterMs: 1000,
    maxConsecutiveFailures: 3,
    maxRetries: 3,
    retryAfterCapMs: 120_000,
    timeoutMs: 15_000,
    headers: { origin: 'https://med.admit.org' },
  },
  // med.admit.org: Admit's public WEBSITE (HTML pages), a different origin from the API above and its own politeness
  // domain. Only the secondaries job reads it (owner 2026-11-23: at least 3 s between requests plus 0-1 s of jitter).
  ADMIT_WEB: {
    origin: 'https://med.admit.org',
    userAgent: MEDSCHOOLS_USER_AGENT,
    spacingMs: 3000,
    jitterMs: 1000,
    backfillSpacingMs: 3000,
    backfillJitterMs: 1000,
    maxConsecutiveFailures: 3,
    maxRetries: 3,
    retryAfterCapMs: 120_000,
    timeoutMs: 20_000,
  },
  // Student Doctor Network. The owners gave written permission (2026-11-20) for all data provided it is
  // anonymized, which is why nothing person-shaped crosses the adapter boundary. www.studentdoctor.net sends
  // `Content-Signal: search=yes, ai-input=yes, ai-train=no`; RMH trains no model and extraction is not training.
  // The forum host and the www host are separate politeness domains (one request at a time each). robots.txt on
  // forums allows /forums/ and /threads/ and disallows /members/, /goto/, /search/ and /find-threads/.
  SDN_FORUMS: {
    origin: 'https://forums.studentdoctor.net',
    userAgent: MEDSCHOOLS_USER_AGENT,
    // Forum pages are heavy (owner 2026-11-23): at least 3 s between requests plus 0-1 s of jitter, live and backfill.
    spacingMs: 3000,
    jitterMs: 1000,
    backfillSpacingMs: 3000,
    backfillJitterMs: 1000,
    maxConsecutiveFailures: 3,
    maxRetries: 3,
    retryAfterCapMs: 120_000,
    timeoutMs: 20_000,
  },
  SDN_WWW: {
    origin: 'https://www.studentdoctor.net',
    userAgent: MEDSCHOOLS_USER_AGENT,
    spacingMs: 1500,
    backfillSpacingMs: 2000,
    maxConsecutiveFailures: 3,
    maxRetries: 3,
    retryAfterCapMs: 120_000,
    timeoutMs: 20_000,
  },
};

/** Default per-host DAILY request budgets (UTC day, all jobs on the host together; env overrides in the worker). */
export const DAILY_REQUEST_BUDGETS: Record<'CYCLETRACK' | 'ADMIT' | 'ADMIT_WEB' | 'SDN_FORUMS' | 'SDN_WWW', number> = {
  // The hourly diff of ~238 schools is about 5,700 a day and the resumable backfill rides on top: this is a runaway
  // guard well above that, not a throttle (the existing 1-2 s spacing is the throttle).
  CYCLETRACK: 20_000,
  // Live (~300 feed polls and a few lookups), interviews (~650) and history (<= 600) come to about 2,000, and the school
  // forums (owner 2026-11-23, <= 600 a day by their own quota) bring it to about 2,600: raised from 3,000 to leave headroom.
  ADMIT: 3500,
  // The secondaries job (two runs a week, one page per school: about 240 pages, plus robots.txt and retries) is the only
  // reader of med.admit.org. 700 is about three times one full run: a runaway guard, not a throttle (the 3 s spacing is).
  ADMIT_WEB: 700,
  SDN_FORUMS: 2000,
  SDN_WWW: 1500,
};

/** Admit profile-history lookups allowed per UTC day (a share of the ADMIT budget; env override in the worker). */
export const ADMIT_HISTORY_DAILY_PROFILES = 600;
/**
 * Admit school-forum requests allowed per UTC day (a share of the ADMIT budget; env override in the worker): eight runs of
 * three summary pages and the threads with new posts, 80 requests at most per run.
 */
export const ADMIT_FORUMS_DAILY_REQUESTS = 600;
