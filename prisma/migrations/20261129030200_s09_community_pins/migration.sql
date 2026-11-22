-- Pinned posts in communities (s09-06): up to three posts a moderator keeps at the top of a community.
-- One new table only; no change to an existing one.

-- CreateTable
CREATE TABLE "community_pinned_post" (
    "communityId" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "pinnedById" TEXT NOT NULL,
    "pinnedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "community_pinned_post_pkey" PRIMARY KEY ("communityId","postId")
);

-- CreateIndex
CREATE INDEX "community_pinned_post_communityId_position_idx" ON "community_pinned_post"("communityId", "position");

-- CreateIndex
CREATE INDEX "community_pinned_post_postId_idx" ON "community_pinned_post"("postId");

-- CreateIndex
CREATE INDEX "community_pinned_post_pinnedById_idx" ON "community_pinned_post"("pinnedById");

-- AddForeignKey
ALTER TABLE "community_pinned_post" ADD CONSTRAINT "community_pinned_post_communityId_fkey" FOREIGN KEY ("communityId") REFERENCES "community"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "community_pinned_post" ADD CONSTRAINT "community_pinned_post_postId_fkey" FOREIGN KEY ("postId") REFERENCES "rmheet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "community_pinned_post" ADD CONSTRAINT "community_pinned_post_pinnedById_fkey" FOREIGN KEY ("pinnedById") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
