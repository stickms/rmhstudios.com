-- Opt-in daily flashcard review reminder: one row per member with the chosen local time, the
-- precomputed next send instant and the once-a-day / pause bookkeeping (lib/study/reminders.server.ts).

-- CreateTable
CREATE TABLE "flashcard_reminder" (
    "userId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "localTime" VARCHAR(5) NOT NULL,
    "timeZone" VARCHAR(64) NOT NULL,
    "nextAt" TIMESTAMP(3),
    "lastSentDay" VARCHAR(10),
    "sentSinceReview" INTEGER NOT NULL DEFAULT 0,
    "paused" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "flashcard_reminder_pkey" PRIMARY KEY ("userId")
);

-- CreateIndex
CREATE INDEX "flashcard_reminder_enabled_nextAt_idx" ON "flashcard_reminder"("enabled", "nextAt");

-- AddForeignKey
ALTER TABLE "flashcard_reminder" ADD CONSTRAINT "flashcard_reminder_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

