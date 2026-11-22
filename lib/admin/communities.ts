/**
 * Community oversight for admins (sprint 10 17) — the pure half: filters, thresholds, the shapes both the server and
 * the page read. Client-safe: no Prisma, no zod. The server half is `communities.server.ts`.
 *
 * The list answers "which communities need an admin's attention": open reports on their posts, moderators who have
 * gone quiet, and sudden growth. The one action is to take a community out of discovery (and back), with a reason the
 * moderators read. There is no freeze, archive or deletion, and nothing changes for members.
 */

export const COMMUNITY_FILTERS = ['all', 'reports', 'quiet', 'growing', 'delisted'] as const;
export type CommunityFilter = (typeof COMMUNITY_FILTERS)[number];
export const DEFAULT_COMMUNITY_FILTER: CommunityFilter = 'all';

/** Rows per page of the list. */
export const COMMUNITIES_PAGE_SIZE = 50;
/** Entries of the mod log on the detail view. */
export const COMMUNITY_DETAIL_LOG_SIZE = 20;
/** Open reports listed on the detail view. */
export const COMMUNITY_DETAIL_REPORT_SIZE = 20;

const DAY_MS = 24 * 60 * 60 * 1000;
/** Posts and joins are counted over this window, and growth compares it with the one before. */
export const COMMUNITY_WINDOW_MS = 7 * DAY_MS;
/** "No moderator action in 30 days". */
export const QUIET_MODERATOR_MS = 30 * DAY_MS;
/** "Growing fast": the week's joins are at least this many, and at least double the week before. */
export const GROWING_MIN_JOINS = 50;
export const GROWING_FACTOR = 2;

/** A report is open while it is waiting or being looked at. */
export const OPEN_REPORT_STATUSES = ['PENDING', 'REVIEWING'] as const;

export function isCommunityFilter(value: unknown): value is CommunityFilter {
  return typeof value === 'string' && (COMMUNITY_FILTERS as readonly string[]).includes(value);
}

/** Joins doubled and at least 50: the "Growing fast" test. */
export function isGrowingFast(joinsThisWeek: number, joinsPreviousWeek: number): boolean {
  return joinsThisWeek >= GROWING_MIN_JOINS && joinsThisWeek >= GROWING_FACTOR * joinsPreviousWeek;
}

/** "No moderator action in 30 days": never acted, or the last action is older than the window. */
export function isModeratorQuiet(lastModActionAt: Date | string | null, now: Date): boolean {
  if (!lastModActionAt) return true;
  return now.getTime() - new Date(lastModActionAt).getTime() > QUIET_MODERATOR_MS;
}

/** The keyset cursor of the list: the last row's member count and id (the order is members, then id, descending). */
export function encodeCommunityCursor(row: { memberCount: number; id: string }): string {
  return `${row.memberCount}:${row.id}`;
}

export function decodeCommunityCursor(cursor: string): { memberCount: number; id: string } | null {
  const at = cursor.indexOf(':');
  if (at < 1) return null;
  const memberCount = Number(cursor.slice(0, at));
  const id = cursor.slice(at + 1);
  if (!Number.isInteger(memberCount) || memberCount < 0 || !id) return null;
  return { memberCount, id };
}

/** One community in the list. */
export interface AdminCommunityRow {
  id: string;
  slug: string;
  name: string;
  isPrivate: boolean;
  memberCount: number;
  postsThisWeek: number;
  openReports: number;
  openModItems: number;
  lastModActionAt: string | null;
  joinsThisWeek: number;
  joinsPreviousWeek: number;
  growingFast: boolean;
  quiet: boolean;
  delistedAt: string | null;
  delistedReason: string | null;
}

export interface AdminCommunityList {
  communities: AdminCommunityRow[];
  nextCursor: string | null;
}

export interface AdminCommunityModerator {
  userId: string;
  name: string;
  handle: string | null;
  role: 'MOD' | 'ADMIN';
  lastActionAt: string | null;
}

export interface AdminCommunityLogEntry {
  id: string;
  /** A code from `MOD_ACTIONS` (lib/communities/modlog.ts). */
  action: string;
  actorName: string | null;
  targetType: string | null;
  reason: string | null;
  createdAt: string;
}

export interface AdminCommunityReport {
  id: string;
  reason: string;
  entityId: string;
  createdAt: string;
}

export interface AdminCommunityDetail {
  community: AdminCommunityRow;
  moderators: AdminCommunityModerator[];
  log: AdminCommunityLogEntry[];
  reports: AdminCommunityReport[];
}

/** Why a delist or return call was refused; the page turns each into a sentence. */
export type CommunityAdminRefusal = 'not-found' | 'already-out' | 'not-out';

export const COMMUNITY_REFUSAL_STATUS: Record<CommunityAdminRefusal, number> = {
  'not-found': 404,
  'already-out': 409,
  'not-out': 409,
};
