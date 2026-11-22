-- RMHStudy focus history: a member's sessions page by keyset on (userId, startedAt desc)
-- without scanning rmhstudy_session.
--
-- Built CONCURRENTLY so the build never blocks the hub's writes; that cannot run inside
-- a multi-statement migration transaction, so this file holds exactly ONE statement.
-- The next migration repairs an invalid index a timed-out build leaves.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "rmhstudy_session_userId_startedAt_idx"
  ON "rmhstudy_session" ("userId", "startedAt" DESC);
