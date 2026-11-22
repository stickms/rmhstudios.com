-- Turn off reposts: a per-member list of people whose reposts are hidden from the Following and For You timelines.
-- Additive only: one new table with its indexes and foreign keys (docs/autonomous/sprint-05/features/07-repost-mutes.md).

-- CreateTable
CREATE TABLE "repost_mute" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "repost_mute_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "repost_mute_userId_createdAt_idx" ON "repost_mute"("userId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "repost_mute_targetId_idx" ON "repost_mute"("targetId");

-- CreateIndex
CREATE UNIQUE INDEX "repost_mute_userId_targetId_key" ON "repost_mute"("userId", "targetId");

-- AddForeignKey
ALTER TABLE "repost_mute" ADD CONSTRAINT "repost_mute_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "repost_mute" ADD CONSTRAINT "repost_mute_targetId_fkey" FOREIGN KEY ("targetId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

