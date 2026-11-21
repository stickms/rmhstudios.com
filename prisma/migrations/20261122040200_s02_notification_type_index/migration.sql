-- Inbox type filter (Mentions and replies, Follows, Likes and reposts, System): serves
-- notification lists filtered by type, newest first, without scanning the whole inbox.
--
-- Built CONCURRENTLY: notification takes a write on every like, comment and follow, and
-- a plain build would block them all. CONCURRENTLY cannot run inside a multi-statement
-- migration transaction, so this file holds exactly ONE statement. The next migration
-- repairs an invalid index a timed-out build leaves.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "notification_userId_type_createdAt_idx"
  ON "notification" ("userId", "type", "createdAt" DESC);
