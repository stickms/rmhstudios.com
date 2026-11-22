-- RMHTube watch statistics: pause and clear markers on the member's counters, plus per-day minutes
-- (rmhtube_watch_day, 90 days). Additive only; nothing is dropped or rewritten.

-- AlterTable
ALTER TABLE "rmhtube_user_stats" ADD COLUMN     "clearedAt" TIMESTAMP(3),
ADD COLUMN     "paused" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "pausedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "rmhtube_watch_day" (
    "userId" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "minutes" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "rmhtube_watch_day_pkey" PRIMARY KEY ("userId","day")
);

-- AddForeignKey
ALTER TABLE "rmhtube_watch_day" ADD CONSTRAINT "rmhtube_watch_day_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

