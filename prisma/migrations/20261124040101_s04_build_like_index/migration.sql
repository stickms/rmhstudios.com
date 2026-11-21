-- Build insights (s04-05): per-day counts read a build's `build_like` rows by date, so index ("buildId", "createdAt").
-- Built CONCURRENTLY so it never blocks writes to a hot table; that cannot run inside a multi-statement migration
-- transaction, so this file holds exactly ONE statement. The _ensure_valid migration repairs a timed-out build.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "build_like_buildId_createdAt_idx"
  ON "build_like" ("buildId", "createdAt");
