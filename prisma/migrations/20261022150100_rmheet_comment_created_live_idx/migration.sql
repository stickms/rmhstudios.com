-- Partial index for the bot-worker comment scan (go-services/internal/botworker/
-- repo_social.go recentCommentsQuery), which runs every 5 minutes:
--
--   FROM "rmheet_comment" c ... WHERE c."createdAt" >= $1 AND c."deletedAt" IS NULL
--   ORDER BY c."createdAt" DESC LIMIT 80
--
-- No existing index leads with createdAt (they are (rmheetId|userId, createdAt)).
-- Write cost: one extra btree entry per live comment insert (append-at-the-right
-- edge, cheap); a soft-delete removes it. See results/ws-9.md.
--
-- NOT mirrored in schema.prisma: Prisma cannot express partial indexes (same as
-- rmheet_feed_scan_idx). A local `migrate dev` may propose dropping
-- rmheet_comment_created_live_idx; do not accept that.
--
-- CONCURRENTLY: exactly ONE statement in this file (cannot run in a transaction).
CREATE INDEX CONCURRENTLY IF NOT EXISTS "rmheet_comment_created_live_idx"
  ON "rmheet_comment" ("createdAt" DESC)
  WHERE "deletedAt" IS NULL;
