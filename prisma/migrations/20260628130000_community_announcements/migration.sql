-- Community announcements: short notices posted by mods/admins that pin to the
-- top of a community for everyone to see.

-- CreateTable
CREATE TABLE "community_announcement" (
    "id" TEXT NOT NULL,
    "communityId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "body" VARCHAR(2000) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "community_announcement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "community_announcement_communityId_createdAt_idx" ON "community_announcement"("communityId", "createdAt" DESC);

-- AddForeignKey
ALTER TABLE "community_announcement" ADD CONSTRAINT "community_announcement_communityId_fkey" FOREIGN KEY ("communityId") REFERENCES "community"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "community_announcement" ADD CONSTRAINT "community_announcement_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
