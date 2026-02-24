-- CreateTable
CREATE TABLE "rmhbox_profile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "totalGamesPlayed" INTEGER NOT NULL DEFAULT 0,
    "totalWins" INTEGER NOT NULL DEFAULT 0,
    "totalScore" INTEGER NOT NULL DEFAULT 0,
    "totalPlayTimeMs" INTEGER NOT NULL DEFAULT 0,
    "minigameStats" JSONB NOT NULL DEFAULT '{}',
    "currentWinStreak" INTEGER NOT NULL DEFAULT 0,
    "bestWinStreak" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rmhbox_profile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rmhbox_match" (
    "id" TEXT NOT NULL,
    "minigameId" TEXT NOT NULL,
    "lobbyId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "durationMs" INTEGER,
    "winnerUserId" TEXT,
    "playerCount" INTEGER NOT NULL,
    "gameLog" JSONB,
    "results" JSONB NOT NULL,

    CONSTRAINT "rmhbox_match_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rmhbox_match_player" (
    "id" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "userName" TEXT NOT NULL,
    "rank" INTEGER NOT NULL,
    "score" INTEGER NOT NULL,
    "wasWinner" BOOLEAN NOT NULL DEFAULT false,
    "stats" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rmhbox_match_player_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "rmhbox_profile_userId_key" ON "rmhbox_profile"("userId");

-- CreateIndex
CREATE INDEX "rmhbox_profile_totalWins_idx" ON "rmhbox_profile"("totalWins" DESC);

-- CreateIndex
CREATE INDEX "rmhbox_profile_totalScore_idx" ON "rmhbox_profile"("totalScore" DESC);

-- CreateIndex
CREATE INDEX "rmhbox_match_minigameId_idx" ON "rmhbox_match"("minigameId");

-- CreateIndex
CREATE INDEX "rmhbox_match_startedAt_idx" ON "rmhbox_match"("startedAt" DESC);

-- CreateIndex
CREATE INDEX "rmhbox_match_lobbyId_idx" ON "rmhbox_match"("lobbyId");

-- CreateIndex
CREATE INDEX "rmhbox_match_player_profileId_idx" ON "rmhbox_match_player"("profileId");

-- CreateIndex
CREATE INDEX "rmhbox_match_player_userId_idx" ON "rmhbox_match_player"("userId");

-- CreateIndex
CREATE INDEX "rmhbox_match_player_createdAt_idx" ON "rmhbox_match_player"("createdAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "rmhbox_match_player_matchId_userId_key" ON "rmhbox_match_player"("matchId", "userId");

-- AddForeignKey
ALTER TABLE "rmhbox_profile" ADD CONSTRAINT "rmhbox_profile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rmhbox_match_player" ADD CONSTRAINT "rmhbox_match_player_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "rmhbox_match"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rmhbox_match_player" ADD CONSTRAINT "rmhbox_match_player_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "rmhbox_profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
