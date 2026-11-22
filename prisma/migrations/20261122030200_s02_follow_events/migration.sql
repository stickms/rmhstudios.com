-- Follow event log: one row per follow, unfollow, block removal or removed follower, written with the
-- Follow change so the audience view can chart gains and losses over time (lib/social/follow-events.server.ts).

-- CreateTable
CREATE TABLE "follow_event" (
    "id" BIGSERIAL NOT NULL,
    "followerId" TEXT NOT NULL,
    "followingId" TEXT NOT NULL,
    "kind" VARCHAR(8) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "follow_event_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "follow_event_followingId_createdAt_idx" ON "follow_event"("followingId", "createdAt");

-- CreateIndex
CREATE INDEX "follow_event_followerId_idx" ON "follow_event"("followerId");

