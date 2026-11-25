-- Synapse Storm "Your matches" (s14-03): a member's own match rows are read by ("userId", "lastUpdateAt" desc).
-- Built CONCURRENTLY so it never blocks writes to ss_player_match, so this file holds exactly ONE statement.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "ss_player_match_userId_lastUpdateAt_idx"
  ON "ss_player_match" ("userId", "lastUpdateAt" DESC);
