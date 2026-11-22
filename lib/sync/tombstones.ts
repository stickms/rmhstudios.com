/**
 * Deletion tombstones for the sync APIs (s09-10). Pure: the kinds, the scope that reads each one, the retention
 * window and the keyset cursor. A tombstone is an id, a kind and a time, never content.
 *
 * Ids: a highlight, deck and card are cuids and are never reused. A bookmark's id is the bookmarked post's id and a
 * shelf entry's is the book's slug, so either can come back after a deletion; a client applies a tombstone only when
 * its `deletedAt` is later than the item's own `bookmarkedAt` / `updatedAt`.
 */

export const TOMBSTONE_KINDS = ['highlight', 'deck', 'card', 'bookmark', 'shelf_entry'] as const;
export type TombstoneKind = (typeof TOMBSTONE_KINDS)[number];

/** The read scope each kind needs (the scope of the list the client is syncing). */
export const TOMBSTONE_SCOPE: Record<TombstoneKind, 'read:reading' | 'read:study' | 'read:bookmarks'> = {
  highlight: 'read:reading',
  shelf_entry: 'read:reading',
  deck: 'read:study',
  card: 'read:study',
  bookmark: 'read:bookmarks',
};

export function isTombstoneKind(value: string): value is TombstoneKind {
  return (TOMBSTONE_KINDS as readonly string[]).includes(value);
}

/** Tombstones are kept this long; a `since` older than this needs a full resync. */
export const TOMBSTONE_RETENTION_DAYS = 90;
export const TOMBSTONE_RETENTION_MS = TOMBSTONE_RETENTION_DAYS * 24 * 60 * 60 * 1000;
export const TOMBSTONE_PAGE_MAX = 500;
export const TOMBSTONE_PAGE_DEFAULT = 100;
/** Rows the nightly prune deletes per statement. */
export const TOMBSTONE_PRUNE_BATCH = 5000;

/** The oldest instant a client may sync from. */
export function tombstoneWindowStart(now: Date): Date {
  return new Date(now.getTime() - TOMBSTONE_RETENTION_MS);
}

/** True when `since` is older than the window, so deletions before it may already be pruned. */
export function sinceExpired(since: Date, now: Date): boolean {
  return since.getTime() < tombstoneWindowStart(now).getTime();
}

export const SYNC_WINDOW_EXPIRED_MESSAGE = `That sync point is older than ${TOMBSTONE_RETENTION_DAYS} days, so deletions since then are no longer kept. Do a full resync, then sync from the time it started.`;

const b64 = (s: string) => btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64 = (s: string): string | null => {
  try {
    return atob(s.replace(/-/g, '+').replace(/_/g, '/'));
  } catch {
    return null;
  }
};

/** Tombstones page by (`deletedAt`, `id`), oldest first. */
export function encodeTombstoneCursor(deletedAt: Date, id: bigint): string {
  return b64(`${deletedAt.toISOString()}|${id.toString()}`);
}

export function decodeTombstoneCursor(cursor: string): { deletedAt: Date; id: bigint } | null {
  const raw = unb64(cursor);
  const at = raw === null ? -1 : raw.indexOf('|');
  if (raw === null || at < 1) return null;
  const deletedAt = new Date(raw.slice(0, at));
  const id = raw.slice(at + 1);
  if (Number.isNaN(deletedAt.getTime()) || !/^\d{1,18}$/.test(id)) return null;
  return { deletedAt, id: BigInt(id) };
}
