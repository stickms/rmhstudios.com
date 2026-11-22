-- Feedback inbox (s06-05): the admin inbox lists one status at a time, newest first, and the hub counts New.
-- Built CONCURRENTLY so it never blocks writes; that cannot run in a multi-statement migration, so this file holds ONE statement.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "feedback_status_createdAt_idx"
  ON "feedback" ("status", "createdAt" DESC);
