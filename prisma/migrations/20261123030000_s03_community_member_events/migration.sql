-- Community insights: one append-only row per join, leave or removal, so the Insights tab can
-- count losses (the member row is deleted when someone leaves). user id is a plain column, nulled on erasure.

-- CreateTable
CREATE TABLE "community_member_event" (
    "id" BIGSERIAL NOT NULL,
    "communityId" TEXT NOT NULL,
    "userId" TEXT,
    "kind" VARCHAR(8) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "community_member_event_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "community_member_event_communityId_createdAt_idx" ON "community_member_event"("communityId", "createdAt");

-- AddForeignKey
ALTER TABLE "community_member_event" ADD CONSTRAINT "community_member_event_communityId_fkey" FOREIGN KEY ("communityId") REFERENCES "community"("id") ON DELETE CASCADE ON UPDATE CASCADE;

