-- Poll lifecycle (s04-08): the poll-ended job finds unannounced polls their author ended early.
-- Built CONCURRENTLY so it never blocks writes; that cannot run inside a multi-statement migration transaction, so
-- this file holds exactly ONE statement. The _ensure_valid migration after it repairs a timed-out build.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "rmheet_poll_endNotifiedAt_closedAt_idx"
  ON "rmheet_poll" ("endNotifiedAt", "closedAt");
