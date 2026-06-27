-- Laundry Sort: 3D rebuild — extended career stats, time-boxed leaderboards,
-- and real-time multiplayer (lobbies / matches / per-player results).

-- CreateEnum
CREATE TYPE "LSLobbyStatus" AS ENUM ('WAITING', 'IN_MATCH', 'CLOSED');

-- CreateEnum
CREATE TYPE "LSMatchStatus" AS ENUM ('RUNNING', 'FINISHED');

-- AlterTable: extend LaundryPlayer with lifetime stats
ALTER TABLE "LaundryPlayer" ADD COLUMN     "bestStreak" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "LaundryPlayer" ADD COLUMN     "totalSorted" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "LaundryPlayer" ADD COLUMN     "totalMissed" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "LaundryPlayer" ADD COLUMN     "rankedWins" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "LaundryPlayer" ADD COLUMN     "rankedPlayed" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "idx_laundry_best_streak" ON "LaundryPlayer"("bestStreak" DESC);

-- CreateTable
CREATE TABLE "laundry_score" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "dateKey" TEXT NOT NULL,
    "weekKey" TEXT NOT NULL,
    "score" INTEGER NOT NULL DEFAULT 0,
    "bestStreak" INTEGER NOT NULL DEFAULT 0,
    "sorted" INTEGER NOT NULL DEFAULT 0,
    "accuracy" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "laundry_score_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ls_lobby" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "status" "LSLobbyStatus" NOT NULL DEFAULT 'WAITING',
    "hostUserId" TEXT NOT NULL,

    CONSTRAINT "ls_lobby_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ls_match" (
    "id" TEXT NOT NULL,
    "lobbyId" TEXT NOT NULL,
    "seed" INTEGER NOT NULL,
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3),
    "status" "LSMatchStatus" NOT NULL DEFAULT 'RUNNING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ls_match_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ls_player_match" (
    "id" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "lobbyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "score" INTEGER NOT NULL DEFAULT 0,
    "bestStreak" INTEGER NOT NULL DEFAULT 0,
    "sorted" INTEGER NOT NULL DEFAULT 0,
    "missed" INTEGER NOT NULL DEFAULT 0,
    "accuracy" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "finishedAt" TIMESTAMP(3),
    "lastUpdateAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ls_player_match_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "laundry_score_userId_mode_dateKey_key" ON "laundry_score"("userId", "mode", "dateKey");

-- CreateIndex
CREATE INDEX "laundry_score_mode_dateKey_score_idx" ON "laundry_score"("mode", "dateKey", "score" DESC);

-- CreateIndex
CREATE INDEX "laundry_score_mode_weekKey_score_idx" ON "laundry_score"("mode", "weekKey", "score" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "ls_lobby_code_key" ON "ls_lobby"("code");

-- CreateIndex
CREATE INDEX "ls_match_lobbyId_idx" ON "ls_match"("lobbyId");

-- CreateIndex
CREATE UNIQUE INDEX "ls_player_match_matchId_userId_key" ON "ls_player_match"("matchId", "userId");

-- CreateIndex
CREATE INDEX "ls_player_match_matchId_idx" ON "ls_player_match"("matchId");

-- CreateIndex
CREATE INDEX "ls_player_match_lobbyId_idx" ON "ls_player_match"("lobbyId");

-- AddForeignKey
ALTER TABLE "ls_match" ADD CONSTRAINT "ls_match_lobbyId_fkey" FOREIGN KEY ("lobbyId") REFERENCES "ls_lobby"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ls_player_match" ADD CONSTRAINT "ls_player_match_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "ls_match"("id") ON DELETE CASCADE ON UPDATE CASCADE;
