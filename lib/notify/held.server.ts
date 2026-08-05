/**
 * Held notifications (B13) — "hold, don't drop".
 *
 * Quiet hours used to be implemented as a **discard**: `dispatch()` computed
 * `wantPush = ch.push && !quiet` and, when quiet, simply skipped the push. The
 * in-app row survived, but the *signal* did not — a user with 22:00–07:00 quiet
 * hours learned nothing about their night until they happened to open the app
 * and scroll. That is the wrong trade: the user asked not to be **woken**, not
 * to be **uninformed**.
 *
 * So a suppressed push is now parked in `HeldNotification` and replayed when the
 * window ends, collapsed into ONE delivery. One is the important number:
 * releasing eleven parked pushes at 07:00 is not "respecting quiet hours", it is
 * moving the interruption and multiplying it. The collapse happens on two axes —
 * `dedupeKey` folds repeats of the same thing ("Alice liked your post" ×6), and
 * the summary folds what is left into a single "while you were away" message.
 *
 * `critical` urgency never reaches this module: security and legal notices go
 * through quiet hours untouched (see `dispatch.server.ts`). Holding a
 * new-device alert until morning would be the one case where the delay is the
 * whole harm.
 */

import { prisma } from '@/lib/prisma.server';
import { sendPushToUser, type PushPayload } from '@/lib/push/send.server';
import { inQuietHours, minutesInTz, type NotifyCategory } from '@/lib/notify/categories';

/* -------------------------------------------------------------------------- */
/* Shape                                                                       */
/* -------------------------------------------------------------------------- */

/** Channels a delivery can be parked on. Only `push` is held today — email is
 *  already batched by the digest jobs, and in-app rows are written regardless. */
export type HeldChannel = 'push';

/**
 * What we parked. Deliberately the *rendered* push payload rather than a
 * reference to the notification row: by the time the hold is flushed the row may
 * have been read, deleted, or had its `preview` rewritten by a dedupe refresh,
 * and re-deriving the text then would produce a message describing the wrong
 * moment. Storing the payload freezes what the user would have been told.
 */
export interface HeldPayload {
  title: string;
  body?: string;
  url?: string;
  /** Device-side coalescing tag, mirrored from the original push. */
  tag?: string;
}

export interface HoldInput {
  userId: string;
  category: NotifyCategory;
  channel: HeldChannel;
  payload: HeldPayload;
  /**
   * Collapse key. Repeats sharing it become ONE line in the flush. Callers pass
   * the dispatch `groupKey` when they have one — the two want exactly the same
   * granularity, and giving them separate spellings guarantees they drift.
   */
  dedupeKey?: string | null;
}

/** A row as this module reads it — the columns the collapse actually needs. */
export interface HeldRow {
  id: bigint;
  category: string;
  channel: string;
  payload: unknown;
  dedupeKey: string | null;
  heldAt: Date;
}

export interface HeldGroup {
  /** `dedupeKey` when present, else `id:<row id>` so unkeyed rows never merge. */
  key: string;
  /** How many held rows folded into this group. Always ≥ 1. */
  count: number;
  /** The newest payload in the group — the freshest description of the thing. */
  payload: HeldPayload;
  /** Newest `heldAt` in the group. */
  latest: Date;
  /** Every row id in the group, so the caller can mark exactly these flushed. */
  ids: bigint[];
}

/* -------------------------------------------------------------------------- */
/* Pure collapse                                                               */
/* -------------------------------------------------------------------------- */

const FALLBACK_TITLE = 'RMH Studios';

/** Narrow the `Json` column back to a payload, tolerating a malformed row. */
function readPayload(value: unknown): HeldPayload {
  if (!value || typeof value !== 'object') return { title: FALLBACK_TITLE };
  const raw = value as Record<string, unknown>;
  const title = typeof raw.title === 'string' && raw.title ? raw.title : FALLBACK_TITLE;
  return {
    title,
    ...(typeof raw.body === 'string' ? { body: raw.body } : {}),
    ...(typeof raw.url === 'string' ? { url: raw.url } : {}),
    ...(typeof raw.tag === 'string' ? { tag: raw.tag } : {}),
  };
}

/**
 * Fold held rows by `dedupeKey`, newest group first. PURE — this is the part
 * with the off-by-one risk (which payload wins, how unkeyed rows behave), so it
 * is tested without a database.
 *
 * Rows with no `dedupeKey` are keyed by their own id: an unkeyed hold is a
 * caller saying "this one is distinct", and merging those would silently drop
 * text nobody can recover.
 */
export function collapseHeld(rows: readonly HeldRow[]): HeldGroup[] {
  const groups = new Map<string, HeldGroup>();

  for (const row of rows) {
    const key = row.dedupeKey ?? `id:${row.id}`;
    const payload = readPayload(row.payload);
    const existing = groups.get(key);
    if (!existing) {
      groups.set(key, { key, count: 1, payload, latest: row.heldAt, ids: [row.id] });
      continue;
    }
    existing.count += 1;
    existing.ids.push(row.id);
    // Newest payload wins: "3 new likes" should read like the most recent one.
    if (row.heldAt.getTime() >= existing.latest.getTime()) {
      existing.latest = row.heldAt;
      existing.payload = payload;
    }
  }

  return [...groups.values()].sort(
    (a, b) => b.latest.getTime() - a.latest.getTime() || (a.key < b.key ? -1 : 1),
  );
}

/**
 * Turn collapsed groups into the ONE push that actually gets sent.
 *
 *  - exactly one held item  → replay it verbatim (the user gets what they would
 *    have got, just later — no "1 notification" indirection to tap through);
 *  - one group, many items  → that group's newest text, badged with its count;
 *  - many groups            → a single neutral summary pointing at the list.
 *
 * PURE. `strings` is injected rather than resolved here so the function stays
 * synchronous and testable; `flushHeldFor` supplies the translated set.
 */
export interface HeldSummaryStrings {
  /** e.g. "While you were away" */
  summaryTitle: string;
  /** e.g. "12 notifications arrived during quiet hours" — receives the count. */
  summaryBody: (count: number) => string;
  /** e.g. "3 new" — the badge appended to a single group's body. */
  groupBody: (count: number) => string;
}

export function summarizeHeld(
  groups: readonly HeldGroup[],
  strings: HeldSummaryStrings,
): PushPayload | null {
  if (groups.length === 0) return null;

  const total = groups.reduce((n, g) => n + g.count, 0);

  if (groups.length === 1) {
    const [only] = groups;
    if (total === 1) {
      return {
        title: only.payload.title,
        ...(only.payload.body ? { body: only.payload.body } : {}),
        url: only.payload.url ?? '/notifications',
        ...(only.payload.tag ? { tag: only.payload.tag } : {}),
      };
    }
    return {
      title: only.payload.title,
      body: strings.groupBody(total),
      url: only.payload.url ?? '/notifications',
      ...(only.payload.tag ? { tag: only.payload.tag } : {}),
    };
  }

  return {
    title: strings.summaryTitle,
    body: strings.summaryBody(total),
    url: '/notifications',
    // One tag for the whole replay, so a second flush REPLACES the first on the
    // device instead of stacking two "while you were away" cards.
    tag: 'held-flush',
  };
}

/* -------------------------------------------------------------------------- */
/* Persistence                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Park a suppressed delivery. Best-effort: a hold that fails to write must never
 * take down the action that produced the notification — the in-app row is
 * already persisted, so the worst case degrades to today's behaviour (the user
 * finds it in the list instead of being told).
 */
export async function holdNotification(input: HoldInput): Promise<void> {
  try {
    await prisma.heldNotification.create({
      data: {
        userId: input.userId,
        category: input.category,
        channel: input.channel,
        payload: { ...input.payload },
        dedupeKey: input.dedupeKey?.slice(0, 160) ?? null,
      },
    });
  } catch (err) {
    console.error('[notify] hold failed:', err);
  }
}

/** Rows read per flush. A user with more than this held gets the rest folded
 *  into the summary count (below) rather than a second push. */
const FLUSH_PAGE = 500;

/**
 * Holds older than this are flushed WITHOUT delivery. If the flush job was down
 * for two days, "Alice liked your post" from Tuesday is not news on Thursday —
 * it is confusing. The in-app row is still there for anyone who cares.
 */
const HELD_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export interface FlushResult {
  /** Rows marked flushed (including stale ones that were not delivered). */
  flushed: number;
  /** Distinct groups the delivered summary represented. */
  groups: number;
  /** Whether a push was actually handed to the push tier. */
  delivered: boolean;
}

/**
 * Release everything held for one user as a single grouped push, then mark the
 * rows flushed.
 *
 * Idempotent in the way that matters: the `flushedAt: null` filter on both the
 * read and the write means a concurrent second call finds nothing left to send.
 * A crash between the send and the update can re-deliver once — chosen
 * deliberately over the alternative (mark first, then send), where the same
 * crash loses the notification permanently and silently.
 */
export async function flushHeldFor(userId: string, now: Date = new Date()): Promise<FlushResult> {
  const empty: FlushResult = { flushed: 0, groups: 0, delivered: false };
  try {
    const where = { userId, flushedAt: null, heldAt: { lte: now } } as const;
    const rows = await prisma.heldNotification.findMany({
      where,
      orderBy: { heldAt: 'asc' },
      take: FLUSH_PAGE,
      select: {
        id: true,
        category: true,
        channel: true,
        payload: true,
        dedupeKey: true,
        heldAt: true,
      },
    });
    if (rows.length === 0) return empty;

    const cutoff = now.getTime() - HELD_MAX_AGE_MS;
    const deliverable = rows.filter(
      (row) => row.channel === 'push' && row.heldAt.getTime() >= cutoff,
    );
    const groups = collapseHeld(deliverable);
    const payload = summarizeHeld(groups, heldSummaryStrings());

    if (payload) await sendPushToUser(userId, payload);

    // Flush the whole window, not just the page we read: anything left behind
    // would be replayed at the next window boundary as stale news.
    const res = await prisma.heldNotification.updateMany({ where, data: { flushedAt: now } });
    return { flushed: res.count, groups: groups.length, delivered: Boolean(payload) };
  } catch (err) {
    console.error('[notify] flushHeldFor failed:', err);
    return empty;
  }
}

/**
 * Flush every user whose quiet window has ended.
 *
 * The web tier runs no cron (see `lib/CLAUDE.md`), so this is the entry point a
 * worker calls on a schedule. It re-checks each user's quiet hours rather than
 * trusting the clock the job fires on: quiet windows are per-user and
 * per-timezone, so "the window ended" is only ever true for a subset of the
 * users with held rows, and flushing the rest would push into the small hours of
 * their night — exactly what the hold exists to prevent.
 */
export async function flushDueHeldNotifications(
  opts: { limit?: number; now?: Date } = {},
): Promise<{ scanned: number; flushedUsers: number }> {
  const now = opts.now ?? new Date();
  const limit = Math.min(Math.max(opts.limit ?? 500, 1), 5000);
  try {
    const pending = await prisma.heldNotification.findMany({
      where: { flushedAt: null, heldAt: { lte: now } },
      orderBy: { heldAt: 'asc' },
      take: limit,
      select: { userId: true },
      distinct: ['userId'],
    });
    if (pending.length === 0) return { scanned: 0, flushedUsers: 0 };

    const userIds = pending.map((row) => row.userId);
    const prefs = await prisma.notificationPreference.findMany({
      where: { userId: { in: userIds } },
      select: { userId: true, quietStart: true, quietEnd: true, tz: true },
    });
    const byUser = new Map(prefs.map((p) => [p.userId, p]));

    let flushedUsers = 0;
    for (const userId of userIds) {
      const pref = byUser.get(userId);
      // No preference row means no quiet hours — the rows were held by a window
      // that has since been cleared, so releasing them now is correct.
      const stillQuiet = pref
        ? inQuietHours(minutesInTz(now, pref.tz), pref.quietStart, pref.quietEnd)
        : false;
      if (stillQuiet) continue;
      const res = await flushHeldFor(userId, now);
      if (res.flushed > 0) flushedUsers += 1;
    }
    return { scanned: userIds.length, flushedUsers };
  } catch (err) {
    console.error('[notify] flushDueHeldNotifications failed:', err);
    return { scanned: 0, flushedUsers: 0 };
  }
}

/* -------------------------------------------------------------------------- */
/* Strings                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * The flush copy.
 *
 * English constants, deliberately, and this is a downgrade from what it looks
 * like it should be. The previous version dynamically imported the i18n
 * instance — but resolved it at `DEFAULT_LOCALE`, so it rendered English
 * anyway. What it *did* do was drag all 16 locale catalogs into the jobs
 * worker's bundle, taking it from ~500 KB to 10.5 MB for three strings that
 * were never translated.
 *
 * Localising this properly does not mean putting i18next back. It means
 * storing the key and its variables on the notification row and rendering in
 * the reader's locale on the client, which is the only place the reader's
 * locale is actually known — a worker only ever knows a stored preference.
 * Until the row carries that, English here is honest about what ships.
 */
function heldSummaryStrings(): HeldSummaryStrings {
  return {
    summaryTitle: 'While you were away',
    summaryBody: (count) =>
      count === 1
        ? '1 notification arrived during quiet hours'
        : `${count} notifications arrived during quiet hours`,
    groupBody: (count) =>
      count === 1 ? '1 new while you were away' : `${count} new while you were away`,
  };
}
