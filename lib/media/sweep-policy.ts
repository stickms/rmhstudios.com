export const ORPHAN_TTL_MS = 24 * 60 * 60 * 1000; // 24h
export const DELETED_POST_GRACE_MS = 7 * 24 * 60 * 60 * 1000; // 7d

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
