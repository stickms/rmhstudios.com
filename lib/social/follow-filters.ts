/**
 * The vocabulary of the follow manager (/follows): which list, which filter, which sort, and the pure
 * helpers around them (query parsing, the page cursor, the id cap). Client-safe: no zod, no Prisma, so the
 * page, the contract and the server share one definition of what a query means.
 *
 * Labels are not here on purpose. `pnpm i18n:extract` scans only `app/` and `components/`, so the
 * components own every `t()` call and this file returns ids.
 */

export const FOLLOW_TABS = ['following', 'followers'] as const;
export type FollowTab = (typeof FOLLOW_TABS)[number];

/**
 * `not-mutual` reads per tab: on Following it is "does not follow you back", on Followers it is "you do not
 * follow back". Both are "the reverse edge is missing".
 */
export const FOLLOW_FILTERS = ['all', 'not-mutual', 'inactive'] as const;
export type FollowFilter = (typeof FOLLOW_FILTERS)[number];

export const FOLLOW_SORTS = ['recent', 'name', 'active'] as const;
export type FollowSort = (typeof FOLLOW_SORTS)[number];

/** "Inactive" means no public post and no comment in this many days. */
export const INACTIVE_DAYS = 90;
/** The most ids one bulk request may name. */
export const MAX_BULK_IDS = 200;
export const FOLLOW_PAGE_SIZE = 30;
export const MAX_QUERY_LENGTH = 80;
/** How long after an unfollow an undo may re-follow without notifying. */
export const UNDO_WINDOW_MS = 10 * 60 * 1000;

export interface FollowQuery {
  tab: FollowTab;
  filter: FollowFilter;
  q: string;
  sort: FollowSort;
}

export const DEFAULT_FOLLOW_QUERY: FollowQuery = {
  tab: 'following',
  filter: 'all',
  q: '',
  sort: 'recent',
};

function pick<T extends string>(allowed: readonly T[], value: unknown, fallback: T): T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : fallback;
}

/** A search string as the server will use it: trimmed, bounded, no control characters. */
export function normalizeSearch(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  // eslint-disable-next-line no-control-regex -- the point is to drop them
  return raw.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, MAX_QUERY_LENGTH);
}

/** Read a query string (router search params or `URLSearchParams` values) into a well-formed query. */
export function parseFollowQuery(raw: Record<string, unknown>): FollowQuery {
  return {
    tab: pick(FOLLOW_TABS, raw.tab, DEFAULT_FOLLOW_QUERY.tab),
    filter: pick(FOLLOW_FILTERS, raw.filter, DEFAULT_FOLLOW_QUERY.filter),
    q: normalizeSearch(raw.q),
    sort: pick(FOLLOW_SORTS, raw.sort, DEFAULT_FOLLOW_QUERY.sort),
  };
}

/** Only the fields that differ from the defaults, so a bare `/follows` stays bare. */
export function followQueryToSearch(query: FollowQuery): Partial<FollowQuery> {
  const out: Partial<FollowQuery> = {};
  if (query.tab !== DEFAULT_FOLLOW_QUERY.tab) out.tab = query.tab;
  if (query.filter !== DEFAULT_FOLLOW_QUERY.filter) out.filter = query.filter;
  if (query.q !== DEFAULT_FOLLOW_QUERY.q) out.q = query.q;
  if (query.sort !== DEFAULT_FOLLOW_QUERY.sort) out.sort = query.sort;
  return out;
}

/** The instant before which a member with no activity counts as inactive. */
export function inactiveCutoff(now: Date = new Date()): Date {
  return new Date(now.getTime() - INACTIVE_DAYS * 24 * 60 * 60 * 1000);
}

/** True when `lastActive` is missing or older than the cutoff. */
export function isInactive(lastActive: Date | string | null, now: Date = new Date()): boolean {
  if (!lastActive) return true;
  return new Date(lastActive).getTime() < inactiveCutoff(now).getTime();
}

/** Escape `%`, `_` and `\` so a search string is matched literally by `ILIKE ... ESCAPE '\'`. */
export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/** Trim, drop blanks and duplicates, keep order. */
export function cleanIds(ids: readonly string[]): string[] {
  return [...new Set(ids.map((id) => id.trim()).filter(Boolean))];
}

/** A page cursor: the sort key of the last row plus its edge id, which breaks ties. */
export interface FollowCursor {
  /** ISO time for `recent` and `active`, the lowercased display name for `name`. */
  k: string;
  id: string;
}

export function encodeFollowCursor(cursor: FollowCursor): string {
  return JSON.stringify(cursor);
}

export function decodeFollowCursor(raw: string | null | undefined): FollowCursor | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (
      parsed &&
      typeof parsed === 'object' &&
      typeof (parsed as FollowCursor).k === 'string' &&
      typeof (parsed as FollowCursor).id === 'string'
    ) {
      return { k: (parsed as FollowCursor).k, id: (parsed as FollowCursor).id };
    }
  } catch {
    // A malformed cursor is a first page.
  }
  return null;
}

/** One person in a list. */
export interface FollowRowData {
  id: string;
  name: string | null;
  image: string | null;
  handle: string | null;
  username: string | null;
  isVerified: boolean;
  /** They follow you. */
  followsYou: boolean;
  /** You follow them. */
  youFollow: boolean;
  /** When the follow edge was made. */
  followedAt: string;
  /** Latest public post or comment; null when there is none. */
  lastActive: string | null;
}

export interface FollowPage {
  rows: FollowRowData[];
  nextCursor: string | null;
  counts: { following: number; followers: number };
}

export interface BulkResult {
  done: number;
  skipped: number;
}
