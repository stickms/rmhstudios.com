-- s10-10: the daily clean-up finds expired mutes by expiresAt. Built CONCURRENTLY so it never blocks writes; this file holds exactly ONE statement.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "user_mute_expiresAt_idx"
  ON "user_mute" ("expiresAt");
