-- Community ownership handover (s04-17): one offer row per offer of a community from its owner to a moderator,
-- accepted, declined, cancelled or expired after 7 days. Additive: a new table and its indexes only.
-- CreateTable
CREATE TABLE "community_handover" (
    "id" TEXT NOT NULL,
    "communityId" TEXT NOT NULL,
    "fromId" TEXT NOT NULL,
    "toId" TEXT NOT NULL,
    "status" VARCHAR(10) NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "decidedAt" TIMESTAMP(3),

    CONSTRAINT "community_handover_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "community_handover_communityId_status_idx" ON "community_handover"("communityId", "status");

-- CreateIndex
CREATE INDEX "community_handover_toId_status_idx" ON "community_handover"("toId", "status");

-- AddForeignKey
ALTER TABLE "community_handover" ADD CONSTRAINT "community_handover_communityId_fkey" FOREIGN KEY ("communityId") REFERENCES "community"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "community_handover" ADD CONSTRAINT "community_handover_fromId_fkey" FOREIGN KEY ("fromId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "community_handover" ADD CONSTRAINT "community_handover_toId_fkey" FOREIGN KEY ("toId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

