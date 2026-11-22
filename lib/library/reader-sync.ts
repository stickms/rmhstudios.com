/**
 * Library reader sync — the pure half (client and server share it).
 *
 * A signed-in reader's place, bookmarks and page notes live on the device first
 * (`reader-store.ts`) and are merged with the server's copy when a book opens and
 * after every write. Everything that decides a conflict is here, as functions of
 * plain data, so the device and the server cannot disagree about who wins:
 *
 *  - bookmarks and notes are a UNION by their client-made id;
 *  - for one id the newer `updatedAt` wins, and a deletion is a record whose
 *    `deletedAt` is set (a tombstone) that competes on the same `updatedAt`, so a
 *    deletion beats an older edit and a newer edit beats an older deletion;
 *  - an exact tie goes to the tombstone, then to the lexically larger content, so
 *    the answer never depends on which side is called "local";
 *  - the place is whichever of the two is newer.
 *
 * Times are epoch milliseconds. No `Date`, no I/O, nothing that throws.
 */

export const MARK_KINDS = ['bookmark', 'note'] as const;
export type MarkKind = (typeof MARK_KINDS)[number];

/** The `clientId` every book's place row uses (one place per member per book). */
export const PLACE_CLIENT_ID = 'place';

/** At most this many bookmarks and notes (live) per book, and per member. */
export const MAX_MARKS_PER_BOOK = 500;
export const MAX_MARKS_PER_USER = 5000;
/** One PUT carries at most this many upserts and tombstones. */
export const MAX_BATCH = 50;
/** Deletions are kept this long so a device that was offline still learns of them. */
export const TOMBSTONE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
/** The place is sent to the server at most this often while pages turn. */
export const PLACE_PUSH_INTERVAL_MS = 10_000;

export const MAX_PAGE = 100_000;
export const MAX_LOCATION = 200;
export const MAX_LABEL = 120;
export const MAX_NOTE = 2000;
/** A client id is a 21 to 40 character URL-safe token (a UUID is 36). */
export const CLIENT_ID_RE = /^[A-Za-z0-9_-]{21,40}$/;

/** One bookmark or note, live or deleted, in the one shape both sides merge. */
export interface MarkRecord {
  id: string;
  kind: MarkKind;
  page: number;
  /** A bookmark's caption, or a note's colour token. */
  label: string | null;
  /** A note's text. */
  body: string | null;
  createdAt: number;
  /** The edit time the merge compares; a tombstone's is the time of the deletion. */
  updatedAt: number;
  deletedAt: number | null;
}

export interface PlaceRecord {
  page: number;
  location: string | null;
  updatedAt: number;
}

export interface SyncBookmark {
  id: string;
  page: number;
  label: string;
  createdAt: number;
  updatedAt?: number | undefined;
}

export interface SyncNote {
  id: string;
  page: number;
  text: string;
  color: string;
  createdAt: number;
  updatedAt: number;
}

/** What the sync reads from a book's device state (`BookState` satisfies it). */
export interface SyncableState {
  page: number;
  loc?: string | undefined;
  placeAt?: number | undefined;
  bookmarks: SyncBookmark[];
  notes: SyncNote[];
  tombstones?: MarkRecord[] | undefined;
}

/** The colour a note gets when the server's copy carries none. */
export const DEFAULT_NOTE_COLOR = '#ffd479';

export function isValidClientId(id: string): boolean {
  return CLIENT_ID_RE.test(id);
}

/* -------------------------------------------------------------------------- */
/* Records                                                                    */
/* -------------------------------------------------------------------------- */

export function isTombstone(r: MarkRecord): boolean {
  return r.deletedAt !== null;
}

export function bookmarkRecord(b: SyncBookmark): MarkRecord {
  return {
    id: b.id,
    kind: 'bookmark',
    page: b.page,
    label: b.label,
    body: null,
    createdAt: b.createdAt,
    updatedAt: b.updatedAt ?? b.createdAt,
    deletedAt: null,
  };
}

export function noteRecord(n: SyncNote): MarkRecord {
  return {
    id: n.id,
    kind: 'note',
    page: n.page,
    label: n.color,
    body: n.text,
    createdAt: n.createdAt,
    updatedAt: n.updatedAt,
    deletedAt: null,
  };
}

/** The device's live bookmarks and notes plus its remembered deletions, as records. */
export function stateToRecords(s: SyncableState): MarkRecord[] {
  const out = [...s.bookmarks.map(bookmarkRecord), ...s.notes.map(noteRecord)];
  const live = new Set(out.map((r) => r.id));
  // A live mark never also has a tombstone on the device, but if it did the live one is what the reader sees.
  for (const t of s.tombstones ?? []) if (!live.has(t.id)) out.push(t);
  return out;
}

/**
 * The device state with its bookmarks, notes and remembered deletions replaced by a
 * merged record set. The place is untouched (see `pickPlace`).
 */
export function applyRecords<S extends SyncableState>(s: S, merged: MarkRecord[]): S {
  const { live, tombstones } = splitRecords(merged);
  const bookmarks: SyncBookmark[] = live
    .filter((r) => r.kind === 'bookmark')
    .map((r) => ({
      id: r.id,
      page: r.page,
      label: r.label ?? '',
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    }));
  const notes: SyncNote[] = live
    .filter((r) => r.kind === 'note')
    .map((r) => ({
      id: r.id,
      page: r.page,
      text: r.body ?? '',
      color: r.label ?? DEFAULT_NOTE_COLOR,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    }));
  return {
    ...s,
    bookmarks,
    notes,
    tombstones,
  };
}

/**
 * The record a deleted bookmark or note leaves behind. It keeps no caption and no note
 * text: a deleted note's words must not linger on the server (or the device) for 30 days.
 */
export function tombstoneOf(r: MarkRecord, now: number): MarkRecord {
  const at = Math.max(now, r.updatedAt + 1);
  return {
    ...r,
    label: null,
    body: null,
    updatedAt: at,
    deletedAt: at,
  };
}

/** A stable string for "did this record change since it was last sent". */
export function fingerprint(r: MarkRecord): string {
  return [r.kind, r.page, r.label ?? '', r.body ?? '', r.updatedAt, r.deletedAt ?? ''].join('\u0001');
}

/* -------------------------------------------------------------------------- */
/* Conflict rule                                                              */
/* -------------------------------------------------------------------------- */

function contentKey(r: MarkRecord): string {
  return `${r.kind}\u0001${r.page}\u0001${r.label ?? ''}\u0001${r.body ?? ''}`;
}

/**
 * The record that wins between two versions of the same id. Newer `updatedAt`
 * wins; on a tie a tombstone wins, then the larger content, so `winner(a, b)` and
 * `winner(b, a)` are always the same record.
 */
export function winner(a: MarkRecord, b: MarkRecord): MarkRecord {
  if (a.updatedAt !== b.updatedAt) return a.updatedAt > b.updatedAt ? a : b;
  const ta = isTombstone(a);
  const tb = isTombstone(b);
  if (ta !== tb) return ta ? a : b;
  return contentKey(a) >= contentKey(b) ? a : b;
}

/** Whether a record's tombstone is old enough that every device has had time to learn of it. */
export function isExpiredTombstone(r: MarkRecord, now: number): boolean {
  return r.deletedAt !== null && now - r.deletedAt > TOMBSTONE_TTL_MS;
}

export interface MarkMerge {
  /** The agreed set, tombstones included (expired ones dropped). */
  merged: MarkRecord[];
  /** The records the server does not yet have in this form. */
  toPush: MarkRecord[];
}

/** Union of the device's records and the server's, one winner per id. */
export function mergeMarks(local: MarkRecord[], remote: MarkRecord[], now: number): MarkMerge {
  const remoteById = new Map(remote.map((r) => [r.id, r]));
  const byId = new Map<string, MarkRecord>();
  for (const r of remote) byId.set(r.id, r);
  for (const l of local) {
    const other = byId.get(l.id);
    byId.set(l.id, other ? winner(l, other) : l);
  }
  const merged: MarkRecord[] = [];
  const toPush: MarkRecord[] = [];
  for (const r of byId.values()) {
    if (isExpiredTombstone(r, now)) continue;
    merged.push(r);
    const theirs = remoteById.get(r.id);
    if (!theirs || fingerprint(theirs) !== fingerprint(r)) toPush.push(r);
  }
  return {
    merged: sortRecords(merged),
    toPush: sortRecords(toPush),
  };
}

function sortRecords(rs: MarkRecord[]): MarkRecord[] {
  return [...rs].sort(
    (a, b) => a.page - b.page || a.createdAt - b.createdAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );
}

/** Split a merged set back into what the reader sees and what the device remembers as deleted. */
export function splitRecords(merged: MarkRecord[]): {
  live: MarkRecord[];
  tombstones: MarkRecord[];
} {
  return {
    live: merged.filter((r) => !isTombstone(r)),
    tombstones: merged.filter(isTombstone),
  };
}

/**
 * Fold the server's answer to a batch back into the device's records. The server already
 * applied the conflict rule to what was sent, so its record replaces the one that was
 * sent, unless the reader changed that mark again while the request was out (then the
 * newer local edit stays and is sent next).
 */
export function adoptCanonical(local: MarkRecord[], canonical: MarkRecord[], sent: MarkRecord[]): MarkRecord[] {
  const sentAs = new Map(sent.map((r) => [r.id, fingerprint(r)]));
  const canon = new Map(canonical.map((r) => [r.id, r]));
  const out: MarkRecord[] = [];
  for (const l of local) {
    const c = canon.get(l.id);
    out.push(c && sentAs.get(l.id) === fingerprint(l) ? c : l);
    canon.delete(l.id);
  }
  return out;
}

/**
 * Marks saved before sync existed may carry ids the server would refuse (the old
 * fallback id was shorter than 21 characters). Give those a fresh id once, on the device,
 * and drop remembered deletions that have outlived the 30 days.
 */
export function prepareForSync<S extends SyncableState>(s: S, newId: () => string, now: number): S {
  const fix = <
    T extends {
      id: string;
    },
  >(
    x: T,
  ): T =>
    isValidClientId(x.id)
      ? x
      : {
          ...x,
          id: newId(),
        };
  return {
    ...s,
    bookmarks: s.bookmarks.map(fix),
    notes: s.notes.map(fix),
    tombstones: (s.tombstones ?? []).filter((t) => !isExpiredTombstone(t, now)),
  };
}

/* -------------------------------------------------------------------------- */
/* Place                                                                      */
/* -------------------------------------------------------------------------- */

export interface PlacePick {
  source: 'device' | 'server';
  page: number;
  loc: string | undefined;
  updatedAt: number;
  /** True when the server's place won and differs from the device's: show the notice. */
  continued: boolean;
}

/** The place to open at: whichever of the device's and the server's is newer. */
export function pickPlace(
  device: {
    page: number;
    loc?: string | undefined;
    placeAt?: number | undefined;
  },
  server: PlaceRecord | null,
): PlacePick {
  const deviceAt = device.page > 0 ? (device.placeAt ?? 0) : 0;
  const keepDevice = {
    source: 'device' as const,
    page: device.page,
    loc: device.loc,
    updatedAt: deviceAt,
    continued: false,
  };
  if (!server || server.page < 1) return keepDevice;
  if (server.updatedAt <= deviceAt) return keepDevice;
  return {
    source: 'server',
    page: server.page,
    loc: server.location ?? undefined,
    updatedAt: server.updatedAt,
    continued: server.page !== device.page || (server.location ?? undefined) !== device.loc,
  };
}

/* -------------------------------------------------------------------------- */
/* Caps and batches                                                           */
/* -------------------------------------------------------------------------- */

export interface CapPlan {
  accepted: string[];
  rejected: string[];
}

/**
 * Which brand-new live marks fit under the caps, in the order they arrived.
 * `bookLive` and `userLive` are the member's current live bookmarks and notes
 * for this book and in total.
 */
export function admitNewMarks(newIds: string[], bookLive: number, userLive: number): CapPlan {
  const room = Math.max(0, Math.min(MAX_MARKS_PER_BOOK - bookLive, MAX_MARKS_PER_USER - userLive));
  return {
    accepted: newIds.slice(0, room),
    rejected: newIds.slice(room),
  };
}

/** Records to send now: those whose current form is not what the server last acknowledged. */
export function pendingRecords(records: MarkRecord[], acknowledged: Map<string, string>): MarkRecord[] {
  return records.filter((r) => acknowledged.get(r.id) !== fingerprint(r));
}

/**
 * A client-supplied edit time as the server stores it: never later than the server's own clock,
 * so a device with a fast clock cannot pin a mark as "newest" forever, and never negative.
 */
export function clampEditTime(clientMs: number, serverNow: number): number {
  return Math.max(0, Math.min(clientMs, serverNow));
}

/** Percent read, 0 to 100, from a 1-based page and the page count. */
export function percentRead(page: number, pages: number): number {
  if (!(pages > 0) || !(page > 0)) return 0;
  return Math.max(0, Math.min(100, Math.round((Math.min(page, pages) / pages) * 100)));
}

/* -------------------------------------------------------------------------- */
/* Throttle                                                                   */
/* -------------------------------------------------------------------------- */

export interface Throttle {
  /** Ask for a run: it happens now if the last was long enough ago, else when the interval ends. */
  poke(): void;
  /** Run now (page hide, leaving the book) and restart the interval. */
  flushNow(): void;
  /** Drop a pending run. */
  cancel(): void;
}

/**
 * A throttle on timers (never a frame callback): at most one `run` per `ms`, the first one
 * at once unless `cooled`, and nothing is scheduled while nobody has poked it, so an idle
 * reader holds no timer.
 */
export function createThrottle(
  run: () => void,
  ms: number,
  opts: {
    now?: () => number;
    cooled?: boolean;
  } = {},
): Throttle {
  const now = opts.now ?? Date.now;
  // `cooled`: the first run also waits a full interval (the reader is still settling on its place).
  let last = opts.cooled ? now() : Number.NEGATIVE_INFINITY;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const fire = () => {
    timer = null;
    last = now();
    run();
  };
  return {
    poke() {
      if (timer) return;
      timer = setTimeout(fire, Math.max(0, last + ms - now()));
    },
    flushNow() {
      if (timer) clearTimeout(timer);
      fire();
    },
    cancel() {
      if (timer) clearTimeout(timer);
      timer = null;
    },
  };
}
