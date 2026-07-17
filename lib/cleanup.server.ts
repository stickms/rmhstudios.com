/**
 * Data-lifecycle cleanup — batched purge of unbounded/ephemeral rows.
 *
 * Addresses the "nothing is ever cleaned up" finding in
 * docs/scalability-audit-2026-07-17.md §1.5: `session`/`verification` rows are
 * never GC'd, `notification` grows unbounded per user forever,
 * `rmheet_comment_view` accumulates one row per (comment, viewer) forever, and
 * soft-deleted posts (`rmheet.deletedAt`) stay in the hot table indefinitely.
 *
 * This module holds ONLY the delete queries. It is wired into an existing worker
 * (server/ladder-worker) on a node-cron schedule guarded by the shared DB
 * worker-lease, so exactly one instance runs it — see that worker for the cron +
 * lease plumbing.
 *
 * Everything is done in bounded batches (raw `DELETE ... WHERE id IN (SELECT id
 * ... LIMIT n)`) rather than one giant `deleteMany`, so each statement holds row
 * locks only briefly and a huge backlog can never lock a hot table for the whole
 * purge. Prisma's `deleteMany` cannot `LIMIT`, so the batching is expressed in
 * raw SQL. Column names are camelCase (Prisma does not snake_case columns) and
 * therefore quoted; table names are the schema's `@@map` values.
 *
 * `.server.ts`: touches Prisma — never import from client code.
 */

// Structural cast, same idiom as lib/rmhladder/worker-lease.ts: narrow the
// generated Prisma client to just the raw-exec method the batched deletes use.
export interface CleanupPrisma {
  $executeRawUnsafe(query: string, ...values: unknown[]): Promise<number>;
}

export interface CleanupOptions {
  /** Delete notification rows older than this many days. */
  notificationRetentionDays: number;
  /**
   * Additionally cap each user to their most-recent M notifications. `0` (or
   * negative) disables the per-user cap and keeps only the age-based purge —
   * which is the minimum the audit asks for.
   */
  notificationMaxPerUser: number;
  /** Delete rmheet_comment_view rows older than this many days. */
  commentViewRetentionDays: number;
  /**
   * Hard-delete soft-deleted posts (`rmheet.deletedAt` set) older than this many
   * days. Only user-initiated deletions are swept; admin-deleted posts
   * (`deletedByAdmin = true`) are retained as moderation evidence.
   */
  softDeleteGraceDays: number;
  /**
   * Whether the destructive post hard-delete runs at all. Defaults OFF: it is
   * the one IRREVERSIBLE step (it cascade-deletes likes/comments/reposts/…), so
   * an operator must explicitly opt in after confirming the grace window.
   */
  hardDeletePosts: boolean;
  /** Rows deleted per statement (keeps each lock short). */
  batchSize: number;
  /** Safety ceiling on batches per sub-task (bounds a single run's duration). */
  maxBatches: number;
  /** Structured log sink (the worker passes its own logger). */
  log: (line: string) => void;
}

export interface CleanupResult {
  expiredSessions: number;
  expiredVerifications: number;
  oldNotifications: number;
  cappedNotifications: number;
  oldCommentViews: number;
  hardDeletedPosts: number;
  durationMs: number;
}

export const DEFAULT_CLEANUP_OPTIONS: Omit<CleanupOptions, 'log'> = {
  notificationRetentionDays: 90,
  notificationMaxPerUser: 1000,
  commentViewRetentionDays: 90,
  softDeleteGraceDays: 30,
  hardDeletePosts: false,
  batchSize: 5000,
  maxBatches: 200,
};

function daysAgo(now: Date, days: number): Date {
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
}

/**
 * Run a `DELETE ... WHERE id IN (SELECT id ... LIMIT $batchSize)` repeatedly
 * until a batch comes back short (no more matching rows) or the batch ceiling is
 * hit. Returns the total rows deleted.
 */
async function deleteInBatches(
  prisma: CleanupPrisma,
  sql: string,
  params: unknown[],
  opts: Pick<CleanupOptions, 'batchSize' | 'maxBatches'>,
): Promise<number> {
  let total = 0;
  for (let batch = 0; batch < opts.maxBatches; batch += 1) {
    const deleted = await prisma.$executeRawUnsafe(sql, ...params);
    total += deleted;
    if (deleted < opts.batchSize) break;
  }
  return total;
}

/** Purge Better Auth `session` rows whose `expiresAt` is in the past. */
export async function purgeExpiredSessions(
  prisma: CleanupPrisma,
  now: Date,
  opts: Pick<CleanupOptions, 'batchSize' | 'maxBatches'>,
): Promise<number> {
  return deleteInBatches(
    prisma,
    `DELETE FROM "session"
     WHERE "id" IN (SELECT "id" FROM "session" WHERE "expiresAt" < $1 LIMIT $2)`,
    [now, opts.batchSize],
    opts,
  );
}

/** Purge Better Auth `verification` rows whose `expiresAt` is in the past. */
export async function purgeExpiredVerifications(
  prisma: CleanupPrisma,
  now: Date,
  opts: Pick<CleanupOptions, 'batchSize' | 'maxBatches'>,
): Promise<number> {
  return deleteInBatches(
    prisma,
    `DELETE FROM "verification"
     WHERE "id" IN (SELECT "id" FROM "verification" WHERE "expiresAt" < $1 LIMIT $2)`,
    [now, opts.batchSize],
    opts,
  );
}

/** Delete `notification` rows created before the retention cutoff. */
export async function purgeOldNotifications(
  prisma: CleanupPrisma,
  cutoff: Date,
  opts: Pick<CleanupOptions, 'batchSize' | 'maxBatches'>,
): Promise<number> {
  return deleteInBatches(
    prisma,
    `DELETE FROM "notification"
     WHERE "id" IN (SELECT "id" FROM "notification" WHERE "createdAt" < $1 LIMIT $2)`,
    [cutoff, opts.batchSize],
    opts,
  );
}

/**
 * Cap each user to their most-recent `maxPerUser` notifications, deleting the
 * overflow. Runs AFTER the age-based purge so the window function scans a
 * smaller working set.
 */
export async function capNotificationsPerUser(
  prisma: CleanupPrisma,
  maxPerUser: number,
  opts: Pick<CleanupOptions, 'batchSize' | 'maxBatches'>,
): Promise<number> {
  if (maxPerUser <= 0) return 0;
  return deleteInBatches(
    prisma,
    `DELETE FROM "notification"
     WHERE "id" IN (
       SELECT "id" FROM (
         SELECT "id",
                ROW_NUMBER() OVER (
                  PARTITION BY "userId"
                  ORDER BY "createdAt" DESC, "id" DESC
                ) AS rn
         FROM "notification"
       ) ranked
       WHERE ranked.rn > $1
       LIMIT $2
     )`,
    [maxPerUser, opts.batchSize],
    opts,
  );
}

/** Delete `rmheet_comment_view` rows created before the retention cutoff. */
export async function purgeOldCommentViews(
  prisma: CleanupPrisma,
  cutoff: Date,
  opts: Pick<CleanupOptions, 'batchSize' | 'maxBatches'>,
): Promise<number> {
  return deleteInBatches(
    prisma,
    `DELETE FROM "rmheet_comment_view"
     WHERE "id" IN (SELECT "id" FROM "rmheet_comment_view" WHERE "createdAt" < $1 LIMIT $2)`,
    [cutoff, opts.batchSize],
    opts,
  );
}

/**
 * Hard-delete user-soft-deleted posts older than the grace cutoff. All FKs
 * referencing `rmheet` are `onDelete: Cascade` (likes/comments/reposts/views/
 * media/poll/bookmarks/reactions/hashtags/edits/unlocks) except quote-repost's
 * self-relation (`SetNull`), so the DB cleans up children automatically. Admin
 * deletions (`deletedByAdmin = true`) are intentionally NOT swept.
 */
export async function purgeSoftDeletedPosts(
  prisma: CleanupPrisma,
  cutoff: Date,
  opts: Pick<CleanupOptions, 'batchSize' | 'maxBatches'>,
): Promise<number> {
  return deleteInBatches(
    prisma,
    `DELETE FROM "rmheet"
     WHERE "id" IN (
       SELECT "id" FROM "rmheet"
       WHERE "deletedAt" IS NOT NULL
         AND "deletedAt" < $1
         AND "deletedByAdmin" = false
       LIMIT $2
     )`,
    [cutoff, opts.batchSize],
    opts,
  );
}

/**
 * Read cleanup options from the environment, falling back to
 * DEFAULT_CLEANUP_OPTIONS. Called by the worker so all cadence/retention knobs
 * are operator-tunable without a code change.
 */
export function cleanupOptionsFromEnv(log: CleanupOptions['log']): CleanupOptions {
  const int = (value: string | undefined, fallback: number): number => {
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback;
  };
  const d = DEFAULT_CLEANUP_OPTIONS;
  return {
    notificationRetentionDays: int(process.env.CLEANUP_NOTIFICATION_RETENTION_DAYS, d.notificationRetentionDays),
    notificationMaxPerUser: int(process.env.CLEANUP_NOTIFICATION_MAX_PER_USER, d.notificationMaxPerUser),
    commentViewRetentionDays: int(process.env.CLEANUP_COMMENT_VIEW_RETENTION_DAYS, d.commentViewRetentionDays),
    softDeleteGraceDays: int(process.env.CLEANUP_SOFT_DELETE_GRACE_DAYS, d.softDeleteGraceDays),
    // Destructive + irreversible: opt-in only.
    hardDeletePosts: process.env.CLEANUP_HARD_DELETE_POSTS === 'true',
    batchSize: Math.max(1, int(process.env.CLEANUP_BATCH_SIZE, d.batchSize)),
    maxBatches: Math.max(1, int(process.env.CLEANUP_MAX_BATCHES, d.maxBatches)),
    log,
  };
}

/**
 * Run the full cleanup sweep once. Every sub-task is independent and best-effort
 * — a failure in one is logged and does not abort the rest. Intended to be
 * called on a schedule under a DB worker-lease so only one instance runs it.
 */
export async function runCleanup(
  prisma: CleanupPrisma,
  options: CleanupOptions,
  now: Date = new Date(),
): Promise<CleanupResult> {
  const startedAt = Date.now();
  const batchOpts = { batchSize: options.batchSize, maxBatches: options.maxBatches };
  const result: CleanupResult = {
    expiredSessions: 0,
    expiredVerifications: 0,
    oldNotifications: 0,
    cappedNotifications: 0,
    oldCommentViews: 0,
    hardDeletedPosts: 0,
    durationMs: 0,
  };

  async function step(label: string, fn: () => Promise<number>): Promise<number> {
    try {
      return await fn();
    } catch (error) {
      options.log(`[cleanup] ${label} failed: ${error instanceof Error ? error.message : String(error)}`);
      return 0;
    }
  }

  result.expiredSessions = await step('expired sessions', () =>
    purgeExpiredSessions(prisma, now, batchOpts),
  );
  result.expiredVerifications = await step('expired verifications', () =>
    purgeExpiredVerifications(prisma, now, batchOpts),
  );
  result.oldNotifications = await step('old notifications', () =>
    purgeOldNotifications(prisma, daysAgo(now, options.notificationRetentionDays), batchOpts),
  );
  result.cappedNotifications = await step('per-user notification cap', () =>
    capNotificationsPerUser(prisma, options.notificationMaxPerUser, batchOpts),
  );
  result.oldCommentViews = await step('old comment views', () =>
    purgeOldCommentViews(prisma, daysAgo(now, options.commentViewRetentionDays), batchOpts),
  );
  if (options.hardDeletePosts) {
    result.hardDeletedPosts = await step('soft-deleted posts', () =>
      purgeSoftDeletedPosts(prisma, daysAgo(now, options.softDeleteGraceDays), batchOpts),
    );
  }

  result.durationMs = Date.now() - startedAt;
  return result;
}
