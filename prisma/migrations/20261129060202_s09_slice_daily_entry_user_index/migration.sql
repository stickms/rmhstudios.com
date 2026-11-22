-- Erasure (s09-16): Account deletion removes a member's Slice It daily entries by userId, which had no index to lead with.
-- Built CONCURRENTLY so it never blocks writes, so this file holds exactly ONE statement.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "slice_daily_entry_userId_idx"
  ON "slice_daily_entry" ("userId");
