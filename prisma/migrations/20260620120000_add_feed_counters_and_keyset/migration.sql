-- Phase 1: denormalized engagement counters on RMHark.
-- Backfilled from the source tables by scripts/reconcile-feed-counts.ts.
ALTER TABLE "rmheet" ADD COLUMN     "likeCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "rmheet" ADD COLUMN     "commentCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "rmheet" ADD COLUMN     "repostCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "rmheet" ADD COLUMN     "viewCount" INTEGER NOT NULL DEFAULT 0;

-- Phase 0: composite indexes backing keyset pagination on (createdAt desc, id desc).
CREATE INDEX "rmheet_createdAt_id_idx" ON "rmheet"("createdAt" DESC, "id" DESC);
CREATE INDEX "rmheet_repost_userId_idx" ON "rmheet_repost"("userId");
CREATE INDEX "rmheet_repost_createdAt_id_idx" ON "rmheet_repost"("createdAt" DESC, "id" DESC);

-- Backfill counters from the source tables so the new columns start consistent.
UPDATE "rmheet" r SET
  "likeCount"    = COALESCE((SELECT COUNT(*) FROM "rmheet_like"    l WHERE l."rmheetId" = r."id"), 0),
  "commentCount" = COALESCE((SELECT COUNT(*) FROM "rmheet_comment" c WHERE c."rmheetId" = r."id"), 0),
  "repostCount"  = COALESCE((SELECT COUNT(*) FROM "rmheet_repost"  rp WHERE rp."rmheetId" = r."id"), 0),
  "viewCount"    = COALESCE((SELECT COUNT(*) FROM "rmheet_view"    v WHERE v."rmheetId" = r."id"), 0);
