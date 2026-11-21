-- Achievement tracker: up to five pinned achievements per member, with the highest
-- progress milestone (50 or 90) already announced for each (lib/achievements/tracking.server.ts).

-- CreateTable
CREATE TABLE "achievement_track" (
    "userId" TEXT NOT NULL,
    "achievementId" VARCHAR(64) NOT NULL,
    "notifiedPct" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "achievement_track_pkey" PRIMARY KEY ("userId","achievementId")
);

-- AddForeignKey
ALTER TABLE "achievement_track" ADD CONSTRAINT "achievement_track_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

