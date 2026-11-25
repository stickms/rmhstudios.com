/**
 * Per-feature timeouts, the half a socket hub can import.
 *
 * Same split, and the same reason, as `lib/economy/play-limits-core.ts`: the hubs (RMHTube, RMHBox, the socket
 * server) hold their own Prisma client and never import the web tier, so the rule that says what an active timeout
 * IS lives here, bound to a client the caller passes. `restrictions.server.ts` uses the same rule over the web
 * tier's client, and re-exports `activeRestrictionWhere` for its existing callers: a second copy of the rule is how
 * it drifts.
 *
 * This module imports Prisma types and the plain L1 store (`lib/cache-l1.ts`) and nothing else
 * (`lib/__tests__/server-bundle-copies.test.ts`).
 */

import type { Prisma, PrismaClient } from '@prisma/client';
import { lruL1 } from '../cache-l1';

/** A client that can read timeouts: the base client, or a fake that has this one delegate. */
export type RestrictionDb = Pick<PrismaClient, 'featureRestriction'>;

/** The features a hub can ask about (the ids in `RESTRICTABLE_FEATURES`; kept a string so this file imports no list). */
export type RestrictionFeature = string;

export function activeRestrictionWhere(userId: string, now = new Date()): Prisma.FeatureRestrictionWhereInput {
  return {
    userId,
    ...activeRestrictionRule(now),
  };
}

/**
 * The same rule without the member, for a relation filter over many members (the due-post sweep skips every author
 * timed out of posting: `user: { featureRestrictions: { none: { feature: 'post', ...activeRestrictionRule(now) } } }`).
 */
export function activeRestrictionRule(now = new Date()): Prisma.FeatureRestrictionWhereInput {
  return {
    liftedAt: null,
    OR: [
      {
        expiresAt: null,
      },
      {
        expiresAt: {
          gt: now,
        },
      },
    ],
  };
}

export interface ActiveRestrictionRow {
  feature: string;
  /** Epoch ms; null = permanent. */
  expiresAt: number | null;
}

/** The user's active rows, read through `db`. */
export async function loadActiveRestrictionRows(
  db: RestrictionDb,
  userId: string,
  now = new Date(),
): Promise<ActiveRestrictionRow[]> {
  const found = await db.featureRestriction.findMany({
    where: activeRestrictionWhere(userId, now),
    select: {
      feature: true,
      expiresAt: true,
    },
  });
  return found.map((r) => ({
    feature: r.feature,
    expiresAt: r.expiresAt?.getTime() ?? null,
  }));
}

/**
 * The active restriction on `feature` among `rows`, or null. The longest one wins and a permanent one beats any
 * timed one. A row whose end has passed since it was read does not count (a cache may outlive a short timeout).
 */
export function pickActiveRestriction(
  rows: readonly ActiveRestrictionRow[],
  feature: RestrictionFeature,
  nowMs = Date.now(),
): { expiresAt: Date | null } | null {
  const live = rows.filter((r) => r.feature === feature && (r.expiresAt === null || r.expiresAt > nowMs));
  if (live.length === 0) return null;
  if (live.some((r) => r.expiresAt === null)) return { expiresAt: null };
  return { expiresAt: new Date(Math.max(...live.map((r) => r.expiresAt ?? 0))) };
}

/** How long a hub trusts what it read, as the web tier does (`RESTRICTIONS_TTL_MS` there). */
export const HUB_RESTRICTIONS_TTL_MS = 30_000;

/**
 * What this process read about each member, for `HUB_RESTRICTIONS_TTL_MS`. A hub cannot import `cached()` (it
 * brings the web tier's Redis, tracing and metrics along), so it holds the same bounded in-process primitive the
 * web tier's `lruL1()` is (`lib/cache-l1.ts`): LRU past 5,000 members, swept on expiry. `at` is the read's own
 * clock, so a caller (or a test) that passes `now` sees the same 30 seconds. The web tier's reads still go
 * through `cached()` in `restrictions.server.ts`.
 */
const hubCache = lruL1('hub-feature-restrictions', { maxEntries: 5_000 });

interface HubCacheEntry {
  at: number;
  rows: ActiveRestrictionRow[];
}

function freshRows(userId: string, nowMs: number): ActiveRestrictionRow[] | undefined {
  const hit = hubCache.get<HubCacheEntry>(userId);
  return hit && nowMs >= hit.at && nowMs - hit.at < HUB_RESTRICTIONS_TTL_MS ? hit.rows : undefined;
}

/** Forget what was read (one member, or every member). A test, or a writer in the same process, calls this. */
export function clearRestrictionCache(userId?: string): void {
  if (userId === undefined) hubCache.clear();
  else hubCache.delete(userId);
}

/**
 * Whether `userId` is timed out of `feature`, from what this process already read in the last 30 seconds, or
 * `undefined` when it has read nothing fresh (the caller then awaits `isRestrictedIn`).
 */
export function peekRestrictedIn(
  userId: string,
  feature: RestrictionFeature,
  now: Date = new Date(),
): boolean | undefined {
  const rows = freshRows(userId, now.getTime());
  return rows === undefined ? undefined : pickActiveRestriction(rows, feature, now.getTime()) !== null;
}

/**
 * Whether `userId` is timed out of `feature`, for a socket hub or a worker. One read per member per 30 seconds per
 * process; a failed read throws and caches nothing, so the caller decides whether to fail open.
 */
export async function isRestrictedIn(
  db: RestrictionDb,
  userId: string,
  feature: RestrictionFeature,
  now: Date = new Date(),
): Promise<boolean> {
  const nowMs = now.getTime();
  let rows = freshRows(userId, nowMs);
  if (rows === undefined) {
    rows = await loadActiveRestrictionRows(db, userId, now);
    hubCache.set<HubCacheEntry>(userId, { at: nowMs, rows }, HUB_RESTRICTIONS_TTL_MS);
  }
  return pickActiveRestriction(rows, feature, nowMs) !== null;
}
