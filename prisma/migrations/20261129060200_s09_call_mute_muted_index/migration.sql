-- Erasure (s09-16): Account deletion removes the second direction of a call mute (mutedUserId) by this column, which had no index to lead with.
-- Built CONCURRENTLY so it never blocks writes, so this file holds exactly ONE statement.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "call_mute_mutedUserId_idx"
  ON "call_mute" ("mutedUserId");
