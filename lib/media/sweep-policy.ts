export const ORPHAN_TTL_MS = 24 * 60 * 60 * 1000; // 24h
/**
 * How long a soft-deleted post's media survives.
 *
 * Must be **at least** the longest recycle-bin retention window
 * (`TRASH_WINDOW_DAYS_MEMBER` in `lib/trash/types.ts`, currently 90 days), or
 * restoring a post inside its window brings it back without its images — the
 * post returns, the pictures are gone, and nothing tells the user why.
 *
 * This was 7 days, set before the recycle bin existed, when a soft delete was
 * only ever a prelude to a hard one. Raising it costs storage for content
 * nobody can see; not raising it silently corrupts the restore path, which is
 * the worse trade.
 */
export const DELETED_POST_GRACE_MS = 90 * 24 * 60 * 60 * 1000; // 90d — see above

/** When a never-attached upload becomes eligible for cleanup. */
export function mediaExpiresAt(createdAt: Date): Date {
  return new Date(createdAt.getTime() + ORPHAN_TTL_MS);
}

/** PENDING media created before this is orphaned. */
export function orphanCutoff(now: Date): Date {
  return new Date(now.getTime() - ORPHAN_TTL_MS);
}

/** Media whose post was soft-deleted before this is eligible for cleanup. */
export function deletedPostCutoff(now: Date): Date {
  return new Date(now.getTime() - DELETED_POST_GRACE_MS);
}
