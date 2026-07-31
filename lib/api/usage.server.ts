/**
 * Developer-API usage accounting.
 *
 * The rate limiter already counts requests, but only in Redis and only for
 * enforcement: those counters expire after 26 hours, so a developer could not
 * see how much of their quota they had spent, nobody could look back at a spike
 * after the fact, and support had nothing to reason about. This module keeps a
 * durable per-key, per-day rollup alongside it.
 *
 * **Why buffered.** The obvious implementation — upsert a row on every request
 * — puts a database write in the hot path of an endpoint whose whole job is to
 * be fast, and turns a burst of API traffic into an equal burst of writes on a
 * single row per key (a lock-contention hotspot precisely when the key is
 * busiest). Instead, counts accumulate in memory and flush periodically, so a
 * key doing 10,000 requests a minute costs a handful of writes rather than
 * 10,000.
 *
 * **What that trades away**, stated plainly: usage is eventually consistent
 * within the flush interval, and an unflushed buffer is lost if the process
 * dies. Both are acceptable because this is *reporting*, not enforcement — the
 * quota that actually gates traffic is the Redis counter, which is exact and
 * survives a restart. Losing a few seconds of reporting counts cannot let
 * anybody exceed their quota.
 */

import { prisma } from '@/lib/prisma.server';

/** How long counts may sit in memory before being written. */
const FLUSH_INTERVAL_MS = 15_000;

/**
 * Flush early if the buffer grows past this many distinct keys, so a spike
 * across many keys can't hold an unbounded map for a full interval.
 */
const MAX_BUFFERED_KEYS = 500;

interface Counts {
  requests: number;
  units: number;
  clientErrors: number;
  serverErrors: number;
}

/** Buffer keyed by `${keyId}:${day}`. */
const buffer = new Map<string, Counts & { keyId: string; day: string }>();
let flushTimer: ReturnType<typeof setTimeout> | null = null;

/** UTC day bucket ("YYYYMMDD") — matches the rate limiter's bucket exactly. */
export function utcDayKey(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10).replace(/-/g, '');
}

/**
 * Write the buffer out. Each key is its own upsert rather than one batch: a
 * failure on one key must not lose the others, and the per-(key, day) unique
 * index makes each upsert an atomic increment.
 */
export async function flushUsage(): Promise<void> {
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  if (buffer.size === 0) return;

  // Swap the buffer out before awaiting so requests arriving mid-flush
  // accumulate into a fresh map instead of being dropped by the clear.
  const pending = [...buffer.values()];
  buffer.clear();

  await Promise.all(
    pending.map(async (entry) => {
      try {
        await prisma.apiUsageDaily.upsert({
          where: { keyId_day: { keyId: entry.keyId, day: entry.day } },
          create: {
            keyId: entry.keyId,
            day: entry.day,
            requests: entry.requests,
            units: entry.units,
            clientErrors: entry.clientErrors,
            serverErrors: entry.serverErrors,
          },
          update: {
            requests: { increment: entry.requests },
            units: { increment: entry.units },
            clientErrors: { increment: entry.clientErrors },
            serverErrors: { increment: entry.serverErrors },
          },
          select: { id: true },
        });
      } catch (err) {
        // Usage reporting must never break the API it reports on. A key deleted
        // mid-flush (FK violation) is the common case and is simply dropped.
        console.error('[dev-api] usage flush failed:', err);
      }
    })
  );
}

function scheduleFlush(): void {
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    void flushUsage();
  }, FLUSH_INTERVAL_MS);
  // Don't hold the process open for a reporting flush.
  flushTimer.unref?.();
}

/**
 * Record one served request. Synchronous and allocation-light: it must add
 * nothing measurable to the response path.
 */
export function recordUsage(keyId: string, units: number, status: number): void {
  const day = utcDayKey();
  const mapKey = `${keyId}:${day}`;
  let entry = buffer.get(mapKey);
  if (!entry) {
    entry = { keyId, day, requests: 0, units: 0, clientErrors: 0, serverErrors: 0 };
    buffer.set(mapKey, entry);
  }
  entry.requests += 1;
  entry.units += units;
  if (status >= 500) entry.serverErrors += 1;
  else if (status >= 400) entry.clientErrors += 1;

  if (buffer.size >= MAX_BUFFERED_KEYS) void flushUsage();
  else scheduleFlush();
}

export interface UsageDay {
  /** "YYYY-MM-DD" for display. */
  date: string;
  requests: number;
  units: number;
  clientErrors: number;
  serverErrors: number;
}

/**
 * A key's usage over the last `days` UTC days, oldest first, with zero-filled
 * gaps so a chart doesn't silently compress quiet days into nothing.
 */
export async function getKeyUsage(keyId: string, days = 30): Promise<UsageDay[]> {
  const span = Math.min(Math.max(Math.trunc(days), 1), 90);
  const start = new Date(Date.now() - (span - 1) * 24 * 60 * 60 * 1000);

  const rows = await prisma.apiUsageDaily.findMany({
    where: { keyId, day: { gte: utcDayKey(start) } },
    orderBy: { day: 'asc' },
    select: { day: true, requests: true, units: true, clientErrors: true, serverErrors: true },
  });
  const byDay = new Map(rows.map((r) => [r.day, r]));

  const out: UsageDay[] = [];
  for (let i = 0; i < span; i++) {
    const d = new Date(start.getTime() + i * 24 * 60 * 60 * 1000);
    const key = utcDayKey(d);
    const row = byDay.get(key);
    out.push({
      date: d.toISOString().slice(0, 10),
      requests: row?.requests ?? 0,
      units: row?.units ?? 0,
      clientErrors: row?.clientErrors ?? 0,
      serverErrors: row?.serverErrors ?? 0,
    });
  }
  return out;
}
