-- The Next 100 — batch 2 (docs/plans/2026-08-05-next-100-feature-ideas.md)
--
-- NOTE: the generated diff proposed `DROP INDEX rmheet_content_tsv_idx` and
-- `ALTER TABLE rmheet DROP COLUMN content_tsv`. Both are removed here — same
-- reason as 20260728130000_sync_wager_tournament_drift and
-- 20260805125129_next_100_foundation before it. `content_tsv` is a GENERATED
-- tsvector created by 20260717110700_add_search_trgm_fts and consumed by raw
-- SQL in lib/search/posts.server.ts; Prisma cannot model it, so EVERY
-- `migrate dev` proposes the drop and accepting it destroys post full-text
-- search. This is the third migration in a row to carry this note — if a
-- fourth needs it, teach `scripts/check-migration-safety.ts` to fail on it by
-- name rather than relying on the next person reading this.
--
-- migration-safety: acknowledged[create-index-not-concurrent] the one index on a
-- pre-existing table (saved_search, two columns) is built plainly because Prisma
-- applies migrations inside a transaction, where CREATE INDEX CONCURRENTLY
-- cannot run. Scoped to that rule so a DROP COLUMN added to this file later
-- still fails the check.

-- AlterTable
ALTER TABLE "Media" ADD COLUMN     "lastAccessAt" TIMESTAMP(3),
ADD COLUMN     "tier" VARCHAR(8) NOT NULL DEFAULT 'hot';

-- AlterTable
ALTER TABLE "feedback" ADD COLUMN     "context" JSONB,
ADD COLUMN     "shotKey" VARCHAR(300);

-- AlterTable
ALTER TABLE "rmheet" ADD COLUMN     "kind" VARCHAR(16) NOT NULL DEFAULT 'standard';

-- AlterTable
ALTER TABLE "saved_search" ADD COLUMN     "name" VARCHAR(60),
ADD COLUMN     "payload" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN     "surface" VARCHAR(24) NOT NULL DEFAULT 'search';

-- CreateTable
CREATE TABLE "creator_post" (
    "id" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "title" VARCHAR(160) NOT NULL,
    "slug" VARCHAR(160) NOT NULL,
    "bodyMarkdown" TEXT NOT NULL,
    "minTierId" TEXT,
    "teaser" TEXT,
    "coverKey" VARCHAR(300),
    "publishedAt" TIMESTAMP(3),
    "emailedAt" TIMESTAMP(3),
    "viewCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "creator_post_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "post_analytics_daily" (
    "id" BIGSERIAL NOT NULL,
    "postId" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "views" INTEGER NOT NULL DEFAULT 0,
    "uniques" INTEGER NOT NULL DEFAULT 0,
    "retention" JSONB NOT NULL DEFAULT '[]',
    "sources" JSONB NOT NULL DEFAULT '{}',
    "followsGained" INTEGER NOT NULL DEFAULT 0,
    "followsLost" INTEGER NOT NULL DEFAULT 0,
    "dwellFirst" INTEGER NOT NULL DEFAULT 0,
    "dwellReturning" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "post_analytics_daily_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "referral_milestone" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "threshold" INTEGER NOT NULL,
    "coins" INTEGER NOT NULL DEFAULT 0,
    "cosmetic" VARCHAR(60),
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "referral_milestone_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "profile_block" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" VARCHAR(12) NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "config" JSONB NOT NULL DEFAULT '{}',
    "clicks" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "profile_block_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reading_room" (
    "id" TEXT NOT NULL,
    "docId" TEXT NOT NULL,
    "hostId" TEXT NOT NULL,
    "anchor" JSONB NOT NULL DEFAULT '{}',
    "positions" JSONB NOT NULL DEFAULT '{}',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reading_room_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "remix_edge" (
    "id" BIGSERIAL NOT NULL,
    "kind" VARCHAR(16) NOT NULL,
    "sourceId" TEXT NOT NULL,
    "derivedId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "remix_edge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_season_stat" (
    "seasonId" VARCHAR(40) NOT NULL,
    "appId" VARCHAR(24) NOT NULL,
    "userId" TEXT NOT NULL,
    "primary" INTEGER NOT NULL DEFAULT 0,
    "secondary" INTEGER NOT NULL DEFAULT 0,
    "rank" INTEGER,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "app_season_stat_pkey" PRIMARY KEY ("seasonId","appId","userId")
);

-- CreateTable
CREATE TABLE "quest_chain_progress" (
    "userId" TEXT NOT NULL,
    "chainId" VARCHAR(40) NOT NULL,
    "steps" JSONB NOT NULL DEFAULT '{}',
    "claimedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "quest_chain_progress_pkey" PRIMARY KEY ("userId","chainId")
);

-- CreateTable
CREATE TABLE "pool" (
    "id" TEXT NOT NULL,
    "creatorId" TEXT NOT NULL,
    "purpose" VARCHAR(24) NOT NULL,
    "targetId" TEXT,
    "goalCoins" INTEGER NOT NULL,
    "raised" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "settledAt" TIMESTAMP(3),
    "refundedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pool_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pool_contribution" (
    "id" BIGSERIAL NOT NULL,
    "poolId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "coins" INTEGER NOT NULL,
    "refundedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pool_contribution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "community_page" (
    "id" TEXT NOT NULL,
    "communityId" TEXT NOT NULL,
    "slug" VARCHAR(60) NOT NULL,
    "title" VARCHAR(120) NOT NULL,
    "body" TEXT NOT NULL,
    "editPolicy" VARCHAR(10) NOT NULL DEFAULT 'mods',
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "community_page_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "community_page_revision" (
    "id" BIGSERIAL NOT NULL,
    "pageId" TEXT NOT NULL,
    "editorId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "summary" VARCHAR(200),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "community_page_revision_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "creator_post_authorId_publishedAt_idx" ON "creator_post"("authorId", "publishedAt" DESC);

-- CreateIndex
CREATE INDEX "creator_post_publishedAt_idx" ON "creator_post"("publishedAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "creator_post_authorId_slug_key" ON "creator_post"("authorId", "slug");

-- CreateIndex
CREATE INDEX "post_analytics_daily_day_idx" ON "post_analytics_daily"("day");

-- CreateIndex
CREATE UNIQUE INDEX "post_analytics_daily_postId_day_key" ON "post_analytics_daily"("postId", "day");

-- CreateIndex
CREATE INDEX "referral_milestone_userId_idx" ON "referral_milestone"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "referral_milestone_userId_threshold_key" ON "referral_milestone"("userId", "threshold");

-- CreateIndex
CREATE INDEX "profile_block_userId_position_idx" ON "profile_block"("userId", "position");

-- CreateIndex
CREATE INDEX "reading_room_docId_active_idx" ON "reading_room"("docId", "active");

-- CreateIndex
CREATE INDEX "reading_room_hostId_idx" ON "reading_room"("hostId");

-- CreateIndex
CREATE INDEX "remix_edge_kind_sourceId_idx" ON "remix_edge"("kind", "sourceId");

-- CreateIndex
CREATE UNIQUE INDEX "remix_edge_kind_derivedId_key" ON "remix_edge"("kind", "derivedId");

-- CreateIndex
CREATE INDEX "app_season_stat_seasonId_appId_primary_idx" ON "app_season_stat"("seasonId", "appId", "primary" DESC);

-- CreateIndex
CREATE INDEX "pool_expiresAt_settledAt_refundedAt_idx" ON "pool"("expiresAt", "settledAt", "refundedAt");

-- CreateIndex
CREATE INDEX "pool_creatorId_idx" ON "pool"("creatorId");

-- CreateIndex
CREATE INDEX "pool_contribution_poolId_idx" ON "pool_contribution"("poolId");

-- CreateIndex
CREATE INDEX "pool_contribution_userId_createdAt_idx" ON "pool_contribution"("userId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "community_page_communityId_pinned_idx" ON "community_page"("communityId", "pinned");

-- CreateIndex
CREATE UNIQUE INDEX "community_page_communityId_slug_key" ON "community_page"("communityId", "slug");

-- CreateIndex
CREATE INDEX "community_page_revision_pageId_createdAt_idx" ON "community_page_revision"("pageId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "saved_search_userId_surface_idx" ON "saved_search"("userId", "surface");

-- AddForeignKey
ALTER TABLE "creator_post" ADD CONSTRAINT "creator_post_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "creator_post" ADD CONSTRAINT "creator_post_minTierId_fkey" FOREIGN KEY ("minTierId") REFERENCES "creator_tier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post_analytics_daily" ADD CONSTRAINT "post_analytics_daily_postId_fkey" FOREIGN KEY ("postId") REFERENCES "rmheet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referral_milestone" ADD CONSTRAINT "referral_milestone_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "profile_block" ADD CONSTRAINT "profile_block_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reading_room" ADD CONSTRAINT "reading_room_hostId_fkey" FOREIGN KEY ("hostId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "remix_edge" ADD CONSTRAINT "remix_edge_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_season_stat" ADD CONSTRAINT "app_season_stat_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quest_chain_progress" ADD CONSTRAINT "quest_chain_progress_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pool" ADD CONSTRAINT "pool_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pool_contribution" ADD CONSTRAINT "pool_contribution_poolId_fkey" FOREIGN KEY ("poolId") REFERENCES "pool"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pool_contribution" ADD CONSTRAINT "pool_contribution_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "community_page" ADD CONSTRAINT "community_page_communityId_fkey" FOREIGN KEY ("communityId") REFERENCES "community"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "community_page_revision" ADD CONSTRAINT "community_page_revision_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "community_page"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "community_page_revision" ADD CONSTRAINT "community_page_revision_editorId_fkey" FOREIGN KEY ("editorId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
