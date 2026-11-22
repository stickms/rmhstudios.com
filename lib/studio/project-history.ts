/**
 * Earlier versions of a cloud Studio project: the limits and the pure rules (no database, no React).
 *
 * A cloud save keeps the version it replaces, but only when that version is at least ten minutes newer than the
 * newest kept one. That anchors a 10-minute window at each kept version, so autosaving every minute for an hour
 * keeps about six versions, not sixty. A restore waives the window so the state it replaces is always recoverable.
 * At most 20 versions per project and 20 MB of stored `sizeBytes` per member; the oldest go first.
 */
import { z } from 'zod';

/** Versions kept per project. */
export const MAX_VERSIONS_PER_PROJECT = 20;
/** Bytes of versions kept per member, summed from stored `sizeBytes`. */
export const MAX_VERSION_BYTES_PER_MEMBER = 20 * 1024 * 1024;
/** A version is kept only when it is at least this much newer than the newest kept one. */
export const VERSION_WINDOW_MS = 10 * 60 * 1000;

export const versionIdSchema = z.string().min(1).max(64);
export const restoreVersionBody = z.object({
  baseRevision: z.number().int().min(1).max(2_000_000_000),
});

/**
 * Whether the version being replaced is kept. `newestKeptSavedAt` is the saved-at of the project's newest kept
 * version (null when it has none); a restore always keeps.
 */
export function shouldCapture(
  previousSavedAt: Date | number,
  newestKeptSavedAt: Date | number | null,
  isRestore: boolean,
): boolean {
  if (isRestore || newestKeptSavedAt === null) return true;
  return Number(previousSavedAt) - Number(newestKeptSavedAt) >= VERSION_WINDOW_MS;
}

/** Tracks in a stored project JSON (0 for anything that is not a project). */
export function trackCountOf(data: unknown): number {
  if (typeof data !== 'object' || data === null) return 0;
  const tracks = (data as { tracks?: unknown }).tracks;
  return Array.isArray(tracks) ? tracks.length : 0;
}

/** Ids to delete so a project keeps at most `keep` versions: the oldest revisions go. */
export function overflowByCount(
  versions: { id: string; revision: number }[],
  keep = MAX_VERSIONS_PER_PROJECT,
): string[] {
  return [...versions]
    .sort((a, b) => b.revision - a.revision)
    .slice(keep)
    .map((v) => v.id);
}

/**
 * Ids to delete, oldest first, until the member's versions total at most `cap` bytes. Ids in `protectedIds` still
 * count toward the total but are never chosen.
 */
export function overflowByBytes(
  versions: { id: string; sizeBytes: number; savedAt: Date | number }[],
  cap = MAX_VERSION_BYTES_PER_MEMBER,
  protectedIds: ReadonlySet<string> = new Set(),
): string[] {
  const oldestFirst = [...versions].sort(
    (a, b) => Number(a.savedAt) - Number(b.savedAt) || (a.id < b.id ? -1 : 1),
  );
  let total = oldestFirst.reduce((sum, v) => sum + v.sizeBytes, 0);
  const out: string[] = [];
  for (const v of oldestFirst) {
    if (total <= cap) break;
    if (protectedIds.has(v.id)) continue;
    out.push(v.id);
    total -= v.sizeBytes;
  }
  return out;
}
