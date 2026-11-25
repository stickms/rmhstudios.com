/**
 * RMHHomes feed oversight (pure): the row shapes /admin/homes shows, the order of the sources, the pause and resume
 * transitions and the key an RSS source is stored under. No database, no zod, no network: the page, the server and
 * the tests share it.
 */

export const HOME_SOURCE_STATUSES = ['ACTIVE', 'DISABLED', 'ERROR', 'BLOCKED'] as const;
export type HomeSourceStatus = (typeof HOME_SOURCE_STATUSES)[number];

export const HOME_SOURCE_PROVIDERS = ['CRAIGSLIST', 'RSS'] as const;
export type HomeSourceProvider = (typeof HOME_SOURCE_PROVIDERS)[number];

export const HOME_LISTING_TYPES = ['RENT', 'SALE'] as const;
export type HomeListingTypeName = (typeof HOME_LISTING_TYPES)[number];

export const HOME_RUN_TRIGGERS = ['CRON', 'MANUAL'] as const;
export type HomeRunTrigger = (typeof HOME_RUN_TRIGGERS)[number];

/** Scrape runs shown under the sources. */
export const RUNS_SHOWN = 20;
/** `HomeSource.key` is VarChar(200). */
export const SOURCE_KEY_MAX = 200;
/** `HomeSource.url` is VarChar(1000). */
export const FEED_URL_MAX = 1000;
/** A source's last error, in characters, in the table (the column holds up to 500). */
export const LAST_ERROR_SHOWN = 200;

export interface AdminHomeSource {
  id: string;
  key: string;
  provider: HomeSourceProvider;
  label: string;
  listingType: HomeListingTypeName;
  status: HomeSourceStatus;
  /** The feed's host and path (an RSS source), never its query: a feed's key often rides there. */
  feed: string | null;
  lastError: string | null;
  lastRunAt: string | null;
  lastSuccessAt: string | null;
  /** Active external listings that came from this source. */
  activeListings: number;
}

export interface AdminHomeRun {
  id: string;
  trigger: HomeRunTrigger;
  startedAt: string;
  finishedAt: string | null;
  /** `null` while the run has no finish time. */
  durationMs: number | null;
  discovered: number;
  created: number;
  updated: number;
  expired: number;
  errors: number;
}

export interface AdminHomesPage {
  sources: AdminHomeSource[];
  runs: AdminHomeRun[];
}

// ─── Order ────────────────────────────────────────────────────────

const STATUS_RANK: Record<HomeSourceStatus, number> = { ERROR: 0, BLOCKED: 1, ACTIVE: 2, DISABLED: 3 };

/** `ERROR` and `BLOCKED` first, then active, then paused; by label inside a status. A new array. */
export function sortSources<T extends { status: HomeSourceStatus; label: string }>(sources: readonly T[]): T[] {
  return [...sources].sort((a, b) => STATUS_RANK[a.status] - STATUS_RANK[b.status] || a.label.localeCompare(b.label));
}

// ─── Pause and resume ─────────────────────────────────────────────

export const STATUS_ACTIONS = ['pause', 'resume'] as const;
export type StatusAction = (typeof STATUS_ACTIONS)[number];

/** A source that is fetched (or tried again) can be paused; only a paused one can be resumed. */
export function canApplyAction(action: StatusAction, seen: HomeSourceStatus): boolean {
  return action === 'pause' ? seen !== 'DISABLED' : seen === 'DISABLED';
}

export function statusAfter(action: StatusAction): HomeSourceStatus {
  return action === 'pause' ? 'DISABLED' : 'ACTIVE';
}

/** The audit action recorded for each. */
export const STATUS_AUDIT_ACTION: Record<StatusAction, string> = {
  pause: 'homes.source.pause',
  resume: 'homes.source.resume',
};

// ─── Feed URL and key ─────────────────────────────────────────────

export type FeedUrlCheck = { ok: true; url: string; key: string } | { ok: false };

/**
 * An RSS feed an admin may add: an `https:` URL with a host, no embedded credentials, short enough to store. The
 * fragment is dropped. The key is `rss:<host><path>` (the path without a trailing slash), so the same feed written
 * with another case in the host or a trailing slash is the same source. Whether the host is public is the SSRF
 * guard's question, asked by the server.
 */
export function checkFeedUrl(raw: string): FeedUrlCheck {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return { ok: false };
  }
  if (u.protocol !== 'https:' || !u.hostname || u.username || u.password) return { ok: false };
  u.hash = '';
  const url = u.toString();
  const key = `rss:${u.host}${u.pathname.replace(/\/+$/, '')}`;
  if (url.length > FEED_URL_MAX || key.length > SOURCE_KEY_MAX) return { ok: false };
  return { ok: true, url, key };
}

/** What the table shows for a feed: host and path, no query string, no credentials. */
export function feedLabel(url: string | null): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    return `${u.host}${u.pathname === '/' ? '' : u.pathname}`;
  } catch {
    return null;
  }
}

/** The last error as the table shows it: one line, cut to length. */
export function lastErrorText(error: string | null): string | null {
  if (!error) return null;
  const line = error.replace(/\s+/g, ' ').trim();
  return line.length > LAST_ERROR_SHOWN ? `${line.slice(0, LAST_ERROR_SHOWN - 1)}…` : line;
}

export function runDurationMs(startedAt: Date, finishedAt: Date | null): number | null {
  return finishedAt ? Math.max(0, finishedAt.getTime() - startedAt.getTime()) : null;
}
