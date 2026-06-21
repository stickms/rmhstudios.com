-- AlterTable
ALTER TABLE "user_profile" ADD COLUMN "xp" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "user_quest" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "questId" VARCHAR(64) NOT NULL,
    "periodKey" VARCHAR(16) NOT NULL,
    "progress" INTEGER NOT NULL DEFAULT 0,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "claimed" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "user_quest_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "user_quest_userId_questId_periodKey_key" ON "user_quest"("userId", "questId", "periodKey");
CREATE INDEX "user_quest_userId_periodKey_idx" ON "user_quest"("userId", "periodKey");
ALTER TABLE "user_quest" ADD CONSTRAINT "user_quest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "user_season_progress" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "seasonId" VARCHAR(32) NOT NULL,
    "seasonXp" INTEGER NOT NULL DEFAULT 0,
    "premium" BOOLEAN NOT NULL DEFAULT false,
    "claimedFree" JSONB NOT NULL DEFAULT '[]',
    "claimedPaid" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "user_season_progress_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "user_season_progress_userId_seasonId_key" ON "user_season_progress"("userId", "seasonId");
ALTER TABLE "user_season_progress" ADD CONSTRAINT "user_season_progress_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
