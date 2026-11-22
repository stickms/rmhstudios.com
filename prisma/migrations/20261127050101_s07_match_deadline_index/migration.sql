-- Match deadlines (s07-06): the schedule cron reads open matches by deadlineAt.
-- Built CONCURRENTLY so it never blocks writes to the tournament match table, so this file holds exactly ONE statement.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "tournament_match_deadlineAt_idx"
  ON "tournament_match" ("deadlineAt");
