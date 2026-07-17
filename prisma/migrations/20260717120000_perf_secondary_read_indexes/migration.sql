-- Secondary read-path performance pass: indexes for the community feed keyset
-- scan, quote-repost lookups, and per-post bookmark reverse lookups, plus a
-- denormalized community.postCount so the community page stops running COUNT(*)
-- over rmheet on every read.

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
