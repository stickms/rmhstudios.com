-- Secondary read-path performance pass: indexes for the community feed keyset
-- scan, quote-repost lookups, and per-post bookmark reverse lookups, plus a
-- denormalized community.postCount so the community page stops running COUNT(*)
-- over rmheet on every read.
--
-- ⚠️ LARGE-TABLE DEPLOY NOTE (rmheet can be very large): the CREATE INDEX
-- statements below are NON-concurrent (Prisma wraps each migration in a
-- transaction, which forbids CREATE INDEX CONCURRENTLY). A plain CREATE INDEX
-- takes a SHARE lock that BLOCKS WRITES (new posts/likes) on the table for the
-- whole build, and can hit `migrate deploy`'s lock_timeout and fail the deploy.
-- On a big rmheet table, prefer building these OUT OF BAND, off-peak, then
-- marking this migration applied so it doesn't try to rebuild them:
--
--   CREATE INDEX CONCURRENTLY IF NOT EXISTS "rmheet_communityId_createdAt_id_idx"
--     ON "rmheet"("communityId","createdAt" DESC,"id" DESC);
--   CREATE INDEX CONCURRENTLY IF NOT EXISTS "rmheet_originalId_idx" ON "rmheet"("originalId");
--   CREATE INDEX CONCURRENTLY IF NOT EXISTS "rmheet_bookmark_rmheetId_idx" ON "rmheet_bookmark"("rmheetId");
--   -- then run the ALTER TABLE + backfill below by hand (both are cheap), and:
--   -- pnpm exec prisma migrate resolve --applied 20260717120000_perf_secondary_read_indexes
--
-- If rmheet is still small, just let this migration run as-is.

-- CreateIndex: community feed keyset scan (communityId + createdAt desc, id desc)
CREATE INDEX "rmheet_communityId_createdAt_id_idx" ON "rmheet"("communityId", "createdAt" DESC, "id" DESC);

-- CreateIndex: quote-repost lookups / original hydration
CREATE INDEX "rmheet_originalId_idx" ON "rmheet"("originalId");

-- CreateIndex: reverse lookup of a post's bookmark rows
CREATE INDEX "rmheet_bookmark_rmheetId_idx" ON "rmheet_bookmark"("rmheetId");

-- AlterTable: denormalized community post counter (maintained on post create/delete)
ALTER TABLE "community" ADD COLUMN "postCount" INTEGER NOT NULL DEFAULT 0;

-- Backfill community.postCount from existing, non-deleted posts so it starts consistent.
UPDATE "community" c SET "postCount" = (
  SELECT count(*) FROM "rmheet" r WHERE r."communityId" = c.id AND r."deletedAt" IS NULL
);
