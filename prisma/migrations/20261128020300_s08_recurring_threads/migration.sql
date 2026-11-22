-- Recurring community threads (s08-09): the templates moderators set to post themselves, weekly or monthly.
-- Additive only: one new table with its indexes and foreign keys.

-- CreateTable
CREATE TABLE "community_recurring_thread" (
    "id" TEXT NOT NULL,
    "communityId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "title" VARCHAR(120) NOT NULL,
    "body" VARCHAR(2000) NOT NULL,
    "flairId" VARCHAR(64),
    "cadence" VARCHAR(8) NOT NULL,
    "weekday" INTEGER,
    "dayOfMonth" INTEGER,
    "minuteOfDay" INTEGER NOT NULL,
    "timeZone" VARCHAR(64) NOT NULL,
    "nextAt" TIMESTAMP(3) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "pausedReason" VARCHAR(32),
    "lastPostId" TEXT,
    "lastPostedAt" TIMESTAMP(3),
    "failures" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "community_recurring_thread_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "community_recurring_thread_active_nextAt_idx" ON "community_recurring_thread"("active", "nextAt");

-- CreateIndex
CREATE INDEX "community_recurring_thread_communityId_idx" ON "community_recurring_thread"("communityId");

-- AddForeignKey
ALTER TABLE "community_recurring_thread" ADD CONSTRAINT "community_recurring_thread_communityId_fkey" FOREIGN KEY ("communityId") REFERENCES "community"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "community_recurring_thread" ADD CONSTRAINT "community_recurring_thread_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

