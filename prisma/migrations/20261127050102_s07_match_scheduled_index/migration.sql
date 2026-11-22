-- Match times (s07-06): the schedule cron reads open matches by scheduledAt.
-- Built CONCURRENTLY so it never blocks writes to the tournament match table, so this file holds exactly ONE statement.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "tournament_match_scheduledAt_idx"
  ON "tournament_match" ("scheduledAt");
