-- Co-op (multiplayer) Dream Rift run records. Powers the combined-score and
-- time-survived leaderboards; one row per completed multiplayer run, submitted
-- by the host.

-- CreateTable
CREATE TABLE "DreamRiftCoopRun" (
    "id" TEXT NOT NULL,
    "difficulty" TEXT NOT NULL DEFAULT 'normal',
    "combinedScore" INTEGER NOT NULL DEFAULT 0,
    "timeSurvived" INTEGER NOT NULL DEFAULT 0,
    "stageReached" INTEGER NOT NULL DEFAULT 1,
    "cleared" BOOLEAN NOT NULL DEFAULT false,
    "playerCount" INTEGER NOT NULL DEFAULT 2,
    "players" JSONB NOT NULL,
    "hostUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DreamRiftCoopRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_dream_rift_coop_score" ON "DreamRiftCoopRun"("difficulty", "combinedScore" DESC);

-- CreateIndex
CREATE INDEX "idx_dream_rift_coop_time" ON "DreamRiftCoopRun"("difficulty", "timeSurvived" DESC);

-- AddForeignKey
ALTER TABLE "DreamRiftCoopRun" ADD CONSTRAINT "DreamRiftCoopRun_hostUserId_fkey" FOREIGN KEY ("hostUserId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
