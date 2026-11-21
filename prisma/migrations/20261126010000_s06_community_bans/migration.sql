-- Community bans and timeouts: one row per sanction of a member of a community (a ban or a timed-out member).
-- The private reason stays with the moderators; expiry is read-time.

-- CreateTable
CREATE TABLE "community_ban" (
    "id" TEXT NOT NULL,
    "communityId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" VARCHAR(8) NOT NULL,
    "endsAt" TIMESTAMP(3),
    "ruleId" TEXT,
    "reason" VARCHAR(300),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "liftedAt" TIMESTAMP(3),
    "liftedById" TEXT,

    CONSTRAINT "community_ban_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "community_ban_communityId_userId_liftedAt_idx" ON "community_ban"("communityId", "userId", "liftedAt");

-- CreateIndex
CREATE INDEX "community_ban_communityId_createdAt_idx" ON "community_ban"("communityId", "createdAt" DESC);

-- AddForeignKey
ALTER TABLE "community_ban" ADD CONSTRAINT "community_ban_communityId_fkey" FOREIGN KEY ("communityId") REFERENCES "community"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "community_ban" ADD CONSTRAINT "community_ban_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

