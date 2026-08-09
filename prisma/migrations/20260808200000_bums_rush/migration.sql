-- CreateTable
CREATE TABLE "bums_rush_profile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "head" TEXT NOT NULL DEFAULT 'biro',
    "hat" TEXT,
    "gloves" TEXT NOT NULL DEFAULT 'mitten',
    "ink" TEXT NOT NULL DEFAULT 'seat-1',
    "unlockedCosmetics" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "parcelsFound" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "posesFound" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "recipesMade" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "bindings" JSONB,
    "settings" JSONB,
    "levelsCleared" INTEGER NOT NULL DEFAULT 0,
    "deaths" INTEGER NOT NULL DEFAULT 0,
    "metresSwung" INTEGER NOT NULL DEFAULT 0,
    "showdownRating" INTEGER NOT NULL DEFAULT 1000,
    "showdownWins" INTEGER NOT NULL DEFAULT 0,
    "showdownLosses" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bums_rush_profile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bums_rush_level_clear" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "levelId" TEXT NOT NULL,
    "playerCount" INTEGER NOT NULL,
    "bestMs" INTEGER NOT NULL,
    "objectives" INTEGER NOT NULL DEFAULT 0,
    "assisted" BOOLEAN NOT NULL DEFAULT false,
    "clears" INTEGER NOT NULL DEFAULT 1,
    "firstClearAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bums_rush_level_clear_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bums_rush_showdown_match" (
    "id" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "teams" BOOLEAN NOT NULL DEFAULT false,
    "rounds" INTEGER NOT NULL,
    "endedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "flagged" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "bums_rush_showdown_match_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bums_rush_showdown_player" (
    "id" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "userId" TEXT,
    "seatIndex" INTEGER NOT NULL,
    "roundsWon" INTEGER NOT NULL DEFAULT 0,
    "won" BOOLEAN NOT NULL DEFAULT false,
    "ratingBefore" INTEGER,
    "ratingAfter" INTEGER,

    CONSTRAINT "bums_rush_showdown_player_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bums_rush_run" (
    "id" TEXT NOT NULL,
    "levelId" TEXT NOT NULL,
    "playerCount" INTEGER NOT NULL,
    "durationMs" INTEGER NOT NULL,
    "deaths" INTEGER NOT NULL,
    "objectives" INTEGER NOT NULL,
    "assisted" BOOLEAN NOT NULL,
    "catUsed" BOOLEAN NOT NULL DEFAULT false,
    "userIds" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bums_rush_run_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "bums_rush_profile_userId_key" ON "bums_rush_profile"("userId");

-- CreateIndex
CREATE INDEX "bums_rush_profile_showdownRating_idx" ON "bums_rush_profile"("showdownRating");

-- CreateIndex
CREATE INDEX "bums_rush_level_clear_levelId_playerCount_assisted_bestMs_idx" ON "bums_rush_level_clear"("levelId", "playerCount", "assisted", "bestMs");

-- CreateIndex
CREATE UNIQUE INDEX "bums_rush_level_clear_userId_levelId_playerCount_key" ON "bums_rush_level_clear"("userId", "levelId", "playerCount");

-- CreateIndex
CREATE INDEX "bums_rush_showdown_match_endedAt_idx" ON "bums_rush_showdown_match"("endedAt");

-- CreateIndex
CREATE INDEX "bums_rush_showdown_player_userId_idx" ON "bums_rush_showdown_player"("userId");

-- CreateIndex
CREATE INDEX "bums_rush_run_levelId_createdAt_idx" ON "bums_rush_run"("levelId", "createdAt");

-- AddForeignKey
ALTER TABLE "bums_rush_profile" ADD CONSTRAINT "bums_rush_profile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bums_rush_level_clear" ADD CONSTRAINT "bums_rush_level_clear_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "bums_rush_profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bums_rush_showdown_player" ADD CONSTRAINT "bums_rush_showdown_player_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "bums_rush_showdown_match"("id") ON DELETE CASCADE ON UPDATE CASCADE;

