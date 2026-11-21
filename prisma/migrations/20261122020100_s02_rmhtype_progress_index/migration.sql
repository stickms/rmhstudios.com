-- RMHType progress page: the trend and run list read a member's runs newest first,
-- so index (userId, createdAt desc) on rmhtype_match_player. Additive, index only.
--
-- Built CONCURRENTLY so the build never blocks writes to a hot table; that cannot
-- run inside a multi-statement migration transaction, so this file holds exactly ONE
-- statement. The next migration repairs an invalid index a timed-out build leaves.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "rmhtype_match_player_userId_createdAt_idx"
  ON "rmhtype_match_player" ("userId", "createdAt" DESC);
