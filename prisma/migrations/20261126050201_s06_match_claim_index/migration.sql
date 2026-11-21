-- Match results (s06-20): the per-minute job reads open claims by claimedAt.
-- Plain index so it matches the Prisma schema's @@index([claimedAt]) exactly (no migrate drift).
-- Built CONCURRENTLY so it never blocks writes to tournament_match; this file holds exactly ONE statement.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "tournament_match_claimedAt_idx"
  ON "tournament_match" ("claimedAt");
