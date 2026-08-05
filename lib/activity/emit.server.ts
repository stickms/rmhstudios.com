/**
 * Activity stream — buffered writer (C7). Server-only.
 *
 * ── Why this is a buffer and not an insert ──────────────────────────────────
 *
 * `Activity` is fed by the cheapest events on the site: a VIEWED per card that
 * scrolls into the viewport, a PLAYED per session, a SAVED per bookmark. One
 * feed scroll on a phone is on the order of 30–60 VIEWED events. Written
 * synchronously that is 30–60 round trips, 30–60 connections borrowed from a
 * pool of 10 (`DATABASE_POOL_SIZE`), and 30–60 WAL records — for telemetry that
 * nothing reads in real time. The request that pays for it is a *scroll*: the
 * user is waiting on the feed, not on the fact that they were counted.
 *
 * So every emit lands in an in-process Map and reaches Postgres as ONE
 * `createMany` per flush window. A scroll becomes a single multi-row insert;
 * the request path pays a Map write.
 *
 * This is the same shape `lib/hot-counters.server.ts` uses for post views and
 * presence heartbeats — lazily-started flusher, `unref()`'d timer so it never
 * holds the process open, every failure swallowed, an exported drain for
 * shutdown — and it is deliberately the same so there is one buffered-write
 * pattern in the codebase rather than two. Two differences, both forced by the
 * data:
 *
 *   1. **In-process, not Redis.** hot-counters buffers in Redis because it is
 *      COLLAPSING many events into one number, and the collapse has to be
 *      correct across every web process. Activity rows are distinct inserts —
 *      nothing collapses across processes — so a Redis round trip per event
 *      would add a network hop and still leave one row per event to write. The
 *      cost we are removing is round trips, and an in-process Map removes them
 *      without adding any.
 *   2. **A one-shot timer, not an interval.** hot-counters drains a set that
 *      other processes are also writing to, so it must keep looking. This buffer
 *      only ever holds what THIS process put in it, so a timer armed on the
 *      first buffered event and disarmed by the flush means an idle process
 *      wakes up zero times.
 *
 * ── What is deliberately given up ───────────────────────────────────────────
 *
 * Up to {@link FLUSH_INTERVAL_MS} of activity is lost if a web process is
 * SIGKILLed, and a failed flush is dropped rather than retried. Both are
 * correct for this table: it is a projection source for "jump back in", not a
 * ledger. `lib/coins.server.ts` is where writes must not be lost, and it is not
 * buffered. Do not add anything to this path that a user could notice missing.
 *
 * ── Shutdown ────────────────────────────────────────────────────────────────
 *
 * {@link flushActivity} drains the buffer and awaits any in-flight write. A
 * process that terminates gracefully should call it from its SIGTERM handler
 * (see the `shutdown()` functions in `server/*`); the blue/green hotswap gives
 * the old container a drain window, so this is the difference between losing
 * two seconds of activity per deploy and losing none.
 */

import type { $Enums } from '@prisma/client';
import { prisma } from '@/lib/prisma.server';
import {
  ACTIVITY_KIND_MAX,
  ACTIVITY_ENTITY_ID_MAX,
  activityKey,
  type ActivityEvent,
  type ActivityMeta,
  type ActivityVerb,
} from './types';

/**
 * Compile-time proof that the client-safe union in `types.ts` and the generated
 * Prisma enum are the same set. If a verb is added to the schema and not here
 * (or vice versa) this line stops compiling — which is the whole reason the
 * union may be re-declared without a Prisma import.
 */
type _VerbsAgree = ActivityVerb extends $Enums.ActivityVerb
  ? $Enums.ActivityVerb extends ActivityVerb
    ? true
    : never
  : never;
const _verbsAgree: _VerbsAgree = true;
void _verbsAgree;

/* -------------------------------------------------------------------------- */
/* Tuning                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * How long an event may sit unwritten.
 *
 * Short enough that the resume rail is right when someone opens a second tab,
 * long enough that a burst of scroll events coalesces into one insert. Two
 * seconds is roughly one "read a card, keep scrolling" cycle.
 */
const FLUSH_INTERVAL_MS = 2_000;

/**
 * Flush early once the buffer reaches this many DISTINCT rows.
 *
 * A multi-row `createMany` is one statement whatever its width, but a very wide
 * one holds a connection long enough to matter and builds a parameter list that
 * has to be parsed. 200 keeps a single insert comfortably small while still
 * absorbing the biggest realistic burst (a fast scroll through an image grid)
 * in one or two writes.
 */
const MAX_BUFFER_ROWS = 200;

/**
 * The point at which the buffer stops accepting and starts dropping.
 *
 * Reached only when flushes are failing (Postgres down) while events keep
 * arriving — the one path on which an unbounded buffer becomes an OOM that
 * takes the web tier down over telemetry. Dropping is strictly better; the
 * counter below makes the drop visible instead of silent.
 */
const HARD_CAP_ROWS = MAX_BUFFER_ROWS * 10;

/* -------------------------------------------------------------------------- */
/* State                                                                      */
/* -------------------------------------------------------------------------- */

interface BufferedActivity {
  userId: string;
  verb: ActivityVerb;
  kind: string;
  entityId: string;
  meta: ActivityMeta;
  at: Date;
}

/**
 * Keyed by `(userId, verb, kind, entityId)` — the de-duplication happens by
 * construction rather than by a pass over an array, so a 200-event burst is 200
 * Map writes and not a 200×200 scan.
 */
let buffer = new Map<string, BufferedActivity>();
let flushTimer: ReturnType<typeof setTimeout> | null = null;
/** The write currently in flight, so `flushActivity()` can await it. */
let inFlight: Promise<void> | null = null;
let dropped = 0;

function ensureFlusher(): void {
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    void flushActivity();
  }, FLUSH_INTERVAL_MS);
  // Never let a pending activity flush keep a worker or a test runner alive.
  if (flushTimer && typeof flushTimer === 'object' && 'unref' in flushTimer) {
    flushTimer.unref();
  }
}

/* -------------------------------------------------------------------------- */
/* Emit                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Record one activity event.
 *
 * **Synchronous and `void` on purpose.** There is nothing to await — the row
 * has not been written and will not be for up to two seconds — so returning a
 * Promise would only invite call sites to `await` a no-op inside a request, or
 * to float one and hand an unhandled rejection to the process. Nothing this
 * function can be given makes it throw: a bad event is dropped, a failed flush
 * is logged and dropped. A caller emitting activity is never the reason a
 * request fails.
 *
 * Repeats of the same `(userId, verb, kind, entityId)` inside one flush window
 * collapse to a single row: a card that crosses the viewport three times as
 * someone scrolls back and forth is one view, not three. The surviving row
 * carries the LATEST `at` (the rail sorts by recency, and the latest touch is
 * the honest answer) and its `meta` is the merge of every occurrence with later
 * keys winning, so a PLAYED that reports `{ level: 7 }` and then `{ level: 8 }`
 * keeps 8.
 *
 * ```ts
 * emitActivity({ userId, verb: 'VIEWED', kind: 'post', entityId: postId });
 * emitActivity({ userId, verb: 'PLAYED', kind: 'game', entityId: 'isleworks', meta: { level: 7 } });
 * ```
 */
export function emitActivity(event: ActivityEvent): void {
  try {
    const userId = event.userId;
    const kind = event.kind;
    const entityId = event.entityId;

    // Anonymous traffic has nowhere to go — `Activity.userId` is a required FK.
    if (!userId || !kind || !entityId) return;
    // Length is checked HERE rather than at flush time: one over-long value in a
    // `createMany` fails the whole batch, so a single bad call site would take
    // out every unrelated event buffered beside it.
    if (kind.length > ACTIVITY_KIND_MAX || entityId.length > ACTIVITY_ENTITY_ID_MAX) return;

    if (buffer.size >= HARD_CAP_ROWS) {
      dropped++;
      return;
    }

    const key = activityKey({ userId, verb: event.verb, kind, entityId });
    const existing = buffer.get(key);
    const at = event.at ?? new Date();

    if (existing) {
      existing.at = at;
      if (event.meta) existing.meta = { ...existing.meta, ...event.meta };
    } else {
      buffer.set(key, { userId, verb: event.verb, kind, entityId, meta: event.meta ?? {}, at });
    }

    if (buffer.size >= MAX_BUFFER_ROWS) {
      void flushActivity();
      return;
    }
    ensureFlusher();
  } catch {
    // Defensive: a caller passing something exotic must not become their 500.
  }
}

/* -------------------------------------------------------------------------- */
/* Flush                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Write everything buffered and await any write already in flight. Returns the
 * number of rows handed to Postgres. Never throws.
 *
 * Call it on SIGTERM. Calling it at any other time is safe but pointless — the
 * timer already does.
 */
export async function flushActivity(): Promise<number> {
  // Await the previous write first so a shutdown drain cannot return while rows
  // are still in flight, and so two concurrent callers don't interleave batches.
  if (inFlight) await inFlight.catch(() => {});
  if (buffer.size === 0) return 0;

  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }

  // Swap the buffer out BEFORE awaiting. Events emitted during the write land in
  // the fresh Map and are picked up by the next flush; clearing afterwards would
  // discard them.
  const batch = Array.from(buffer.values());
  buffer = new Map();

  if (dropped > 0) {
    console.error(`[activity] dropped ${dropped} event(s) — buffer hit its hard cap`);
    dropped = 0;
  }

  const write = prisma.activity
    .createMany({
      data: batch.map((row) => ({
        userId: row.userId,
        verb: row.verb,
        kind: row.kind,
        entityId: row.entityId,
        meta: row.meta,
        at: row.at,
      })),
    })
    .then(() => {})
    .catch((error: unknown) => {
      // Dropped, not retried — see the "what is deliberately given up" note.
      // Re-queueing a batch that failed because the database is down is how a
      // bounded buffer becomes an unbounded one.
      console.error('[activity] flush failed:', (error as Error)?.message);
    })
    .finally(() => {
      if (inFlight === write) inFlight = null;
    });

  inFlight = write;
  await write;
  return batch.length;
}

/* -------------------------------------------------------------------------- */
/* Introspection (tests / diagnostics)                                        */
/* -------------------------------------------------------------------------- */

/** Rows waiting to be written. Exported for tests and health output. */
export function bufferedActivityCount(): number {
  return buffer.size;
}

/**
 * Throw the buffer away without writing it.
 *
 * Test-only: a suite that asserts on flush behaviour needs a clean slate
 * between cases, and `flushActivity()` would write the previous case's rows
 * into the next case's mock.
 */
export function __resetActivityBuffer(): void {
  buffer = new Map();
  dropped = 0;
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  inFlight = null;
}
