/**
 * Hot-path counter buffering — server-only.
 *
 * Two of the highest-frequency writes in the app hit a single hot row on every
 * event:
 *   - post views  → UPDATE rmheet SET viewCount = viewCount + 1  (per impression)
 *   - presence    → UPDATE "user" SET lastSeenAt = now()         (per heartbeat)
 *
 * Both serialize on one row and churn WAL/autovacuum. This module absorbs them
 * in Redis and reconciles to Postgres periodically:
 *   - views are INCR'd in Redis and flushed in batches (a viral post becomes one
 *     UPDATE per flush interval instead of thousands of row-locked UPDATEs);
 *   - presence is tracked in a per-minute Redis set for the "online now" count,
 *     and the Postgres lastSeenAt write is throttled to at most once / 5 min per
 *     user (kept only for the "last seen" display / friend-presence query).
 *
 * Without Redis every helper degrades to the original direct-to-Postgres write,
 * so single-instance / local dev behaves exactly as before.
 */

import { prisma } from '@/lib/prisma.server';
import { mapWithConcurrency } from '@/lib/async-pool';
import {
  redisEnabled,
  redisIncrBy,
  redisIncrByAndSadd,
  redisSpop,
  redisGetDel,
  redisPresenceMark,
  redisPresenceCount,
  redisPresenceFilter,
} from '@/lib/redis.server';

// ─── View counts ────────────────────────────────────────────────────────────

const VIEW_BUF_PREFIX = 'viewbuf:';
const VIEW_DIRTY_SET = 'viewbuf:dirty';
const VIEW_TTL_MS = 60 * 60 * 1000; // safety expiry so an un-flushed key can't leak forever
const FLUSH_INTERVAL_MS = 10_000;
/** Redis is cheap and pipelines well, so claims can run fairly wide. */
const REDIS_CLAIM_CONCURRENCY = 16;
/** Kept well below the Postgres pool (default 10) — this is background work. */
const DB_WRITE_CONCURRENCY = 4;

let flushTimer: ReturnType<typeof setInterval> | null = null;

function ensureFlusher(): void {
  if (flushTimer || !redisEnabled()) return;
  flushTimer = setInterval(() => {
    void flushBufferedViews().catch((e) =>
      console.error('[hot-counters] view flush failed:', (e as Error)?.message),
    );
  }, FLUSH_INTERVAL_MS);
  if (flushTimer && typeof flushTimer === 'object' && 'unref' in flushTimer) {
    flushTimer.unref();
  }
}

/**
 * Record a post view. Buffered in Redis (flushed later) when available; falls
 * back to an in-process buffer (one batched UPDATE per flush) otherwise. Never throws.
 */
export async function bufferPostView(postId: string): Promise<void> {
  if (redisEnabled()) {
    // perf: counter bump + dirty-set mark in one round trip (was two sequential).
    const n = await redisIncrByAndSadd(
      VIEW_BUF_PREFIX + postId,
      1,
      VIEW_TTL_MS,
      VIEW_DIRTY_SET,
      postId,
    );
    if (n !== null) {
      ensureFlusher();
      return;
    }
  }
  // perf: no Redis (or Redis write failed) used to mean one row-locked UPDATE
  // per impression. Coalesce in-process and flush as a single unnest UPDATE.
  bufferViewLocally(postId);
}

// ─── In-process fallback buffer (no Redis) ──────────────────────────────────

/** Distinct posts held in memory before we fall back to a direct write. */
const LOCAL_MAX_KEYS = 5_000;
const localViewBuf = new Map<string, number>();
let localTimer: ReturnType<typeof setInterval> | null = null;

function bufferViewLocally(postId: string): void {
  if (localViewBuf.size >= LOCAL_MAX_KEYS && !localViewBuf.has(postId)) {
    void prisma.rMHark
      .update({ where: { id: postId }, data: { viewCount: { increment: 1 } } })
      .catch(() => {});
    return;
  }
  localViewBuf.set(postId, (localViewBuf.get(postId) ?? 0) + 1);
  if (!localTimer) {
    localTimer = setInterval(() => {
      void flushLocalViews().catch((e) =>
        console.error('[hot-counters] local view flush failed:', (e as Error)?.message),
      );
    }, FLUSH_INTERVAL_MS);
    localTimer.unref?.();
  }
}

/**
 * Write the in-process view buffer with ONE statement. Also called on shutdown
 * (server/nitro/drain.ts). On failure the deltas are put back so the next tick
 * retries; a post deleted meanwhile simply matches no row. Returns rows sent.
 */
export async function flushLocalViews(): Promise<number> {
  if (localViewBuf.size === 0) return 0;
  const batch = [...localViewBuf.entries()];
  localViewBuf.clear();
  try {
    await prisma.$executeRaw`
      UPDATE "rmheet" r SET "viewCount" = r."viewCount" + t."inc"
      FROM unnest(${batch.map(([id]) => id)}::text[], ${batch.map(([, n]) => n)}::int[]) AS t("id", "inc")
      WHERE r."id" = t."id"`;
    return batch.length;
  } catch (e) {
    for (const [id, n] of batch) localViewBuf.set(id, (localViewBuf.get(id) ?? 0) + n);
    throw e;
  }
}

/**
 * Drain buffered view counts into Postgres. Safe to run from multiple processes
 * concurrently: SPOP and GETDEL are atomic, so each post's buffered delta is
 * claimed by exactly one flusher. Returns the number of posts updated.
 */
export async function flushBufferedViews(batch = 500): Promise<number> {
  let flushed = await flushLocalViews().catch(() => 0);
  if (!redisEnabled()) return flushed;
  for (;;) {
    const ids = await redisSpop(VIEW_DIRTY_SET, batch);
    if (ids.length === 0) break;

    // Claim every buffered delta in this batch concurrently. These were read one
    // at a time, so a full 500-id batch cost 500 sequential Redis round-trips
    // before a single row was written — on a flusher that re-runs every 10s.
    const deltas = await mapWithConcurrency(ids, REDIS_CLAIM_CONCURRENCY, async (id) => {
      const raw = await redisGetDel(VIEW_BUF_PREFIX + id);
      return { id, inc: raw ? parseInt(raw, 10) : 0 };
    });

    // Each post carries its own increment, so these can't collapse into an
    // updateMany — but they are independent rows and can overlap. Concurrency is
    // deliberately well under the connection pool: this is background
    // reconciliation and must not starve request handlers.
    const pending = deltas.filter((d) => d.inc > 0);
    await mapWithConcurrency(pending, DB_WRITE_CONCURRENCY, async ({ id, inc }) => {
      await prisma.rMHark
        .update({ where: { id }, data: { viewCount: { increment: inc } } })
        .catch(() => {
          /* post may have been deleted; drop the buffered delta */
        });
    });
    flushed += pending.length;

    if (ids.length < batch) break;
  }
  return flushed;
}

// ─── Presence ────────────────────────────────────────────────────────────────

const PRESENCE_TTL_MS = 3 * 60 * 1000;
const PRESENCE_DB_THROTTLE_MS = 5 * 60 * 1000;

function presenceBucket(tsMs: number): string {
  return `presence:min:${Math.floor(tsMs / 60_000)}`;
}

/**
 * Mark a user active. Updates the Redis presence set (fast "online now") and
 * throttles the Postgres lastSeenAt write to ~once / 5 min per user. Without
 * Redis it writes lastSeenAt every call (original behaviour). Never throws.
 */
export async function markPresence(userId: string): Promise<void> {
  const now = Date.now();
  if (redisEnabled()) {
    // perf: the two Redis writes are independent — run them concurrently.
    const [, first] = await Promise.all([
      redisPresenceMark(userId, presenceBucket(now), PRESENCE_TTL_MS),
      redisIncrBy(`presence:dbwrote:${userId}`, 1, PRESENCE_DB_THROTTLE_MS),
    ]);
    if (first === 1) {
      await prisma.user
        .update({ where: { id: userId }, data: { lastSeenAt: new Date() } })
        .catch(() => {});
    }
    return;
  }
  await prisma.user
    .update({ where: { id: userId }, data: { lastSeenAt: new Date() } })
    .catch(() => {});
}

/**
 * Distinct users seen in the last ~2 minutes, from the Redis presence set.
 * Returns null when Redis is off so the caller can fall back to a DB COUNT.
 */
export async function getOnlinePresenceCount(): Promise<number | null> {
  if (!redisEnabled()) return null;
  return redisPresenceCount(onlineBuckets());
}

/** The presence buckets that make up the ~2-minute "online now" window. */
function onlineBuckets(): string[] {
  const now = Date.now();
  return [presenceBucket(now), presenceBucket(now - 60_000)];
}

/**
 * Which of `userIds` are online right now, against the same ~2-minute window the
 * site-wide count uses. Returns null when Redis is off so the caller can fall
 * back to its `lastSeenAt` query.
 *
 * This is the accurate answer to "who is online", and `lastSeenAt` is not: a
 * heartbeat only reaches Postgres about once every 5 minutes
 * (PRESENCE_DB_THROTTLE_MS), so filtering that column on a 2-minute window
 * reports most genuinely-online users as offline. The Redis set is written on
 * every heartbeat, which is why it is the authority for the count and should be
 * the authority for membership too.
 */
export async function filterOnlineUsers(userIds: string[]): Promise<string[] | null> {
  if (!redisEnabled()) return null;
  if (userIds.length === 0) return [];
  const found = await redisPresenceFilter(onlineBuckets(), userIds);
  if (!found) return null;
  // Preserve the caller's ordering — it is usually a meaningful one (the follow
  // graph is most-recently-followed first).
  return userIds.filter((id) => found.has(id));
}
