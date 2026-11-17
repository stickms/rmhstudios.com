-- RMH Vibes modernization: page owners and remixes, stored multi-file projects and
-- tweak settings, shared/per-user vibe state (vibe_kv), feed embeds
-- (post_vibe_embed, rmheet.hasVibe) and Discord Activity launches. Additive only:
-- existing pages keep a null owner, kind 'page' and no project.

-- AlterTable
ALTER TABLE "rmheet" ADD COLUMN     "hasVibe" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "vibe_page" ADD COLUMN     "kind" VARCHAR(8) NOT NULL DEFAULT 'page',
ADD COLUMN     "ownerId" TEXT,
ADD COLUMN     "parentPageId" TEXT,
ADD COLUMN     "parentVersionId" TEXT,
ADD COLUMN     "tweakValues" JSONB;
-- AlterTable
ALTER TABLE "vibe_page_version" ADD COLUMN     "project" JSONB,
ADD COLUMN     "tweakSpec" JSONB;

-- CreateTable
CREATE TABLE "vibe_kv" (
    "id" TEXT NOT NULL,
    "pageId" TEXT NOT NULL,
    "scope" VARCHAR(8) NOT NULL,
    "ownerKey" VARCHAR(64) NOT NULL DEFAULT '',
    "key" VARCHAR(64) NOT NULL,
    "value" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
CONSTRAINT "vibe_kv_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "post_vibe_embed" (
    "postId" TEXT NOT NULL,
    "pageId" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
CONSTRAINT "post_vibe_embed_pkey" PRIMARY KEY ("postId")
);

-- CreateTable
CREATE TABLE "discord_vibe_launch" (
    "id" TEXT NOT NULL,
    "channelId" VARCHAR(32) NOT NULL,
    "slug" VARCHAR(64) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
CONSTRAINT "discord_vibe_launch_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "vibe_kv_pageId_scope_ownerKey_idx" ON "vibe_kv"("pageId", "scope", "ownerKey");
-- CreateIndex
CREATE UNIQUE INDEX "vibe_kv_pageId_scope_ownerKey_key_key" ON "vibe_kv"("pageId", "scope", "ownerKey", "key");

-- CreateIndex
CREATE INDEX "post_vibe_embed_pageId_idx" ON "post_vibe_embed"("pageId");
-- CreateIndex
CREATE INDEX "discord_vibe_launch_channelId_createdAt_idx" ON "discord_vibe_launch"("channelId", "createdAt");

-- CreateIndex
-- migration-safety: acknowledged[create-index-not-concurrent] vibe_page is a small table (one row per generated page) and the new ownerId column is null everywhere, so the build is momentary.
CREATE INDEX "vibe_page_ownerId_createdAt_idx" ON "vibe_page"("ownerId", "createdAt");
-- AddForeignKey
ALTER TABLE "vibe_page" ADD CONSTRAINT "vibe_page_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vibe_page" ADD CONSTRAINT "vibe_page_parentPageId_fkey" FOREIGN KEY ("parentPageId") REFERENCES "vibe_page"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "vibe_kv" ADD CONSTRAINT "vibe_kv_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "vibe_page"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post_vibe_embed" ADD CONSTRAINT "post_vibe_embed_postId_fkey" FOREIGN KEY ("postId") REFERENCES "rmheet"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "post_vibe_embed" ADD CONSTRAINT "post_vibe_embed_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "vibe_page"("id") ON DELETE CASCADE ON UPDATE CASCADE;
