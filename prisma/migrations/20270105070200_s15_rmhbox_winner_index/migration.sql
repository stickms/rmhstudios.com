-- Erasure clears a member's wins on rmhbox_match by "winnerUserId" (s14-18), which had no index and so scanned the
-- table on every erasure. Built CONCURRENTLY so it never blocks writes to rmhbox_match, so this file holds exactly ONE
-- statement.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "rmhbox_match_winnerUserId_idx"
  ON "rmhbox_match" ("winnerUserId");
