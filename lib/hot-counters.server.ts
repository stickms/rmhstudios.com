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
import {
  redisEnabled,
  redisIncrBy,
  redisSadd,
  redisSpop,
  redisGetDel,
  redisPresenceMark,
  redisPresenceCount,
} from '@/lib/redis.server';

// ─── View counts ────────────────────────────────────────────────────────────

const VIEW_BUF_PREFIX = 'viewbuf:';
const VIEW_DIRTY_SET = 'viewbuf:dirty';
const VIEW_TTL_MS = 60 * 60 * 1000; // safety expiry so an un-flushed key can't leak forever
const FLUSH_INTERVAL_MS = 10_000;

let flushTimer: ReturnType<typeof setInterval> | null = null;

function ensureFlusher(): void {
  if (flushTimer || !redisEnabled()) return;
  flushTimer = setInterval(() => {
    void flushBufferedViews().catch((e) =>
      console.error('[hot-counters] view flush failed:', (e as Error)?.message)
    );
  }, FLUSH_INTERVAL_MS);
  if (flushTimer && typeof flushTimer === 'object' && 'unref' in flushTimer) {
    flushTimer.unref();
  }
}

/**
 * Record a post view. Buffered in Redis (flushed later) when available; falls
 * back to a direct atomic increment otherwise. Never throws.
 */
export async function bufferPostView(postId: string): Promise<void> {
  if (redisEnabled()) {
    const n = await redisIncrBy(VIEW_BUF_PREFIX + postId, 1, VIEW_TTL_MS);
    if (n !== null) {
      await redisSadd(VIEW_DIRTY_SET, postId);
      ensureFlusher();
      return;
    }
  }
  await prisma.rMHark
    .update({ where: { id: postId }, data: { viewCount: { increment: 1 } } })
    .catch(() => {});
}

/**
 * Drain buffered view counts into Postgres. Safe to run from multiple processes
 * concurrently: SPOP and GETDEL are atomic, so each post's buffered delta is
 * claimed by exactly one flusher. Returns the number of posts updated.
 */
export async function flushBufferedViews(batch = 500): Promise<number> {
  if (!redisEnabled()) return 0;
  let flushed = 0;
  for (;;) {
    const ids = await redisSpop(VIEW_DIRTY_SET, batch);
    if (ids.length === 0) break;
    for (const id of ids) {
      const raw = await redisGetDel(VIEW_BUF_PREFIX + id);
      const inc = raw ? parseInt(raw, 10) : 0;
      if (inc > 0) {
        await prisma.rMHark
          .update({ where: { id }, data: { viewCount: { increment: inc } } })
          .catch(() => {
            /* post may have been deleted; drop the buffered delta */
          });
        flushed++;
      }
    }
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
    await redisPresenceMark(userId, presenceBucket(now), PRESENCE_TTL_MS);
    const first = await redisIncrBy(`presence:dbwrote:${userId}`, 1, PRESENCE_DB_THROTTLE_MS);
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
  const now = Date.now();
  const buckets = [presenceBucket(now), presenceBucket(now - 60_000)];
  return redisPresenceCount(buckets);
}
