-- Card types (s05-09): deleting or regenerating an authored card finds its siblings by "sourceId", so index it.
-- Built CONCURRENTLY so it never blocks writes to flashcard; that cannot run inside a multi-statement migration
-- transaction, so this file holds exactly ONE statement. The _ensure_valid migration repairs a timed-out build.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "flashcard_sourceId_idx"
  ON "flashcard" ("sourceId");
