-- Erasure (s09-16): Account deletion removes a member's song plays by userId, which had no index to lead with.
-- Built CONCURRENTLY so it never blocks writes, so this file holds exactly ONE statement.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "SongPlay_userId_idx"
  ON "SongPlay" ("userId");
