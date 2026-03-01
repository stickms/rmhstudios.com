/*
  Warnings:

  - You are about to drop the column `updatedAt` on the `lights_out_score` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "AltairPlayer" ADD COLUMN     "totalGold" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "totalTimeSurvived" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "lights_out_score" DROP COLUMN "updatedAt",
ALTER COLUMN "moves" SET DEFAULT 0;

-- AlterTable
ALTER TABLE "rmhtype_profile" ADD COLUMN     "bestWpmAccuracy" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "VoidBreakerPlayer" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "highScore" INTEGER NOT NULL DEFAULT 0,
    "bestWave" INTEGER NOT NULL DEFAULT 0,
    "totalKills" INTEGER NOT NULL DEFAULT 0,
    "bestTimeMs" INTEGER NOT NULL DEFAULT 0,
    "gamesPlayed" INTEGER NOT NULL DEFAULT 1,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT,

    CONSTRAINT "VoidBreakerPlayer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "versecraft_save" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "saveData" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "versecraft_save_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "versecraft_progress" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "completedChapters" JSONB NOT NULL DEFAULT '[]',
    "unlockedEndings" JSONB NOT NULL DEFAULT '[]',
    "completedRoutes" JSONB NOT NULL DEFAULT '[]',
    "totalPoemsWritten" INTEGER NOT NULL DEFAULT 0,
    "totalPlaytime" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "versecraft_progress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "altair_coop_profile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "totalCoopRuns" INTEGER NOT NULL DEFAULT 0,
    "totalCoopWins" INTEGER NOT NULL DEFAULT 0,
    "totalRevivesGiven" INTEGER NOT NULL DEFAULT 0,
    "totalRevivesReceived" INTEGER NOT NULL DEFAULT 0,
    "totalCoopKills" INTEGER NOT NULL DEFAULT 0,
    "totalCoopCoins" INTEGER NOT NULL DEFAULT 0,
    "favoriteClassId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "altair_coop_profile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "altair_match" (
    "id" TEXT NOT NULL,
    "lobbyId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "durationMs" INTEGER,
    "playerCount" INTEGER NOT NULL,
    "doubleTime" BOOLEAN NOT NULL DEFAULT false,
    "victory" BOOLEAN NOT NULL DEFAULT false,
    "sharedKills" INTEGER NOT NULL DEFAULT 0,
    "bossesDefeated" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "results" JSONB,

    CONSTRAINT "altair_match_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "altair_match_player" (
    "id" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "userName" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "slot" INTEGER NOT NULL,
    "finalLevel" INTEGER NOT NULL DEFAULT 1,
    "kills" INTEGER NOT NULL DEFAULT 0,
    "coinsEarned" INTEGER NOT NULL DEFAULT 0,
    "timeSurvived" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "wasDowned" BOOLEAN NOT NULL DEFAULT false,
    "wasRevived" BOOLEAN NOT NULL DEFAULT false,
    "revivesGiven" INTEGER NOT NULL DEFAULT 0,
    "wasAliveAtEnd" BOOLEAN NOT NULL DEFAULT true,
    "stats" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "altair_match_player_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rmheet" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "originalId" TEXT,

    CONSTRAINT "rmheet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rmheet_like" (
    "id" TEXT NOT NULL,
    "rmheetId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rmheet_like_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rmheet_comment" (
    "id" TEXT NOT NULL,
    "rmheetId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "parentId" TEXT,

    CONSTRAINT "rmheet_comment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rmheet_repost" (
    "id" TEXT NOT NULL,
    "rmheetId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rmheet_repost_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rmheet_view" (
    "id" TEXT NOT NULL,
    "rmheetId" TEXT NOT NULL,
    "userId" TEXT,
    "ipHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rmheet_view_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_profile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "displayName" VARCHAR(50),
    "customImage" TEXT,
    "customImageSizeBytes" INTEGER,
    "bio" VARCHAR(160),
    "location" VARCHAR(100),
    "website" VARCHAR(200),
    "showLikes" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_profile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "follow" (
    "id" TEXT NOT NULL,
    "followerId" TEXT NOT NULL,
    "followingId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "follow_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "VoidBreakerPlayer_username_key" ON "VoidBreakerPlayer"("username");

-- CreateIndex
CREATE UNIQUE INDEX "VoidBreakerPlayer_userId_key" ON "VoidBreakerPlayer"("userId");

-- CreateIndex
CREATE INDEX "idx_void_breaker_high_score" ON "VoidBreakerPlayer"("highScore" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "versecraft_save_userId_key" ON "versecraft_save"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "versecraft_progress_userId_key" ON "versecraft_progress"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "altair_coop_profile_userId_key" ON "altair_coop_profile"("userId");

-- CreateIndex
CREATE INDEX "altair_coop_profile_totalCoopWins_idx" ON "altair_coop_profile"("totalCoopWins" DESC);

-- CreateIndex
CREATE INDEX "altair_coop_profile_totalRevivesGiven_idx" ON "altair_coop_profile"("totalRevivesGiven" DESC);

-- CreateIndex
CREATE INDEX "altair_match_startedAt_idx" ON "altair_match"("startedAt" DESC);

-- CreateIndex
CREATE INDEX "altair_match_lobbyId_idx" ON "altair_match"("lobbyId");

-- CreateIndex
CREATE INDEX "altair_match_player_userId_idx" ON "altair_match_player"("userId");

-- CreateIndex
CREATE INDEX "altair_match_player_createdAt_idx" ON "altair_match_player"("createdAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "altair_match_player_matchId_userId_key" ON "altair_match_player"("matchId", "userId");

-- CreateIndex
CREATE INDEX "rmheet_userId_idx" ON "rmheet"("userId");

-- CreateIndex
CREATE INDEX "rmheet_createdAt_idx" ON "rmheet"("createdAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "rmheet_like_rmheetId_userId_key" ON "rmheet_like"("rmheetId", "userId");

-- CreateIndex
CREATE INDEX "rmheet_comment_rmheetId_createdAt_idx" ON "rmheet_comment"("rmheetId", "createdAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "rmheet_repost_rmheetId_userId_key" ON "rmheet_repost"("rmheetId", "userId");

-- CreateIndex
CREATE INDEX "rmheet_view_rmheetId_idx" ON "rmheet_view"("rmheetId");

-- CreateIndex
CREATE UNIQUE INDEX "rmheet_view_rmheetId_userId_key" ON "rmheet_view"("rmheetId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "rmheet_view_rmheetId_ipHash_key" ON "rmheet_view"("rmheetId", "ipHash");

-- CreateIndex
CREATE UNIQUE INDEX "user_profile_userId_key" ON "user_profile"("userId");

-- CreateIndex
CREATE INDEX "follow_followerId_idx" ON "follow"("followerId");

-- CreateIndex
CREATE INDEX "follow_followingId_idx" ON "follow"("followingId");

-- CreateIndex
CREATE UNIQUE INDEX "follow_followerId_followingId_key" ON "follow"("followerId", "followingId");

-- CreateIndex
CREATE INDEX "idx_altair_gold" ON "AltairPlayer"("totalGold" DESC);

-- CreateIndex
CREATE INDEX "idx_altair_survival" ON "AltairPlayer"("totalTimeSurvived" DESC);

-- CreateIndex
CREATE INDEX "lights_out_score_dateKey_dnf_idx" ON "lights_out_score"("dateKey", "dnf" ASC);

-- AddForeignKey
ALTER TABLE "VoidBreakerPlayer" ADD CONSTRAINT "VoidBreakerPlayer_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "versecraft_save" ADD CONSTRAINT "versecraft_save_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "versecraft_progress" ADD CONSTRAINT "versecraft_progress_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "altair_coop_profile" ADD CONSTRAINT "altair_coop_profile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "altair_match_player" ADD CONSTRAINT "altair_match_player_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "altair_match"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "altair_match_player" ADD CONSTRAINT "altair_match_player_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rmheet" ADD CONSTRAINT "rmheet_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rmheet" ADD CONSTRAINT "rmheet_originalId_fkey" FOREIGN KEY ("originalId") REFERENCES "rmheet"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rmheet_like" ADD CONSTRAINT "rmheet_like_rmheetId_fkey" FOREIGN KEY ("rmheetId") REFERENCES "rmheet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rmheet_like" ADD CONSTRAINT "rmheet_like_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rmheet_comment" ADD CONSTRAINT "rmheet_comment_rmheetId_fkey" FOREIGN KEY ("rmheetId") REFERENCES "rmheet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rmheet_comment" ADD CONSTRAINT "rmheet_comment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rmheet_comment" ADD CONSTRAINT "rmheet_comment_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "rmheet_comment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rmheet_repost" ADD CONSTRAINT "rmheet_repost_rmheetId_fkey" FOREIGN KEY ("rmheetId") REFERENCES "rmheet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rmheet_repost" ADD CONSTRAINT "rmheet_repost_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rmheet_view" ADD CONSTRAINT "rmheet_view_rmheetId_fkey" FOREIGN KEY ("rmheetId") REFERENCES "rmheet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rmheet_view" ADD CONSTRAINT "rmheet_view_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_profile" ADD CONSTRAINT "user_profile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "follow" ADD CONSTRAINT "follow_followerId_fkey" FOREIGN KEY ("followerId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "follow" ADD CONSTRAINT "follow_followingId_fkey" FOREIGN KEY ("followingId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
