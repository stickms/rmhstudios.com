-- Ranked seasons (P5). A new table rather than a `season` column on
-- `elo_rating`: changing that table's unique constraint from (userId, game) to
-- (userId, game, season) is not safe across a blue/green swap, because old code
-- would write through the old key against the new index for the length of the
-- flip. A new table has no old readers.

-- CreateTable
CREATE TABLE "ranked_season_rating" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "game" VARCHAR(40) NOT NULL,
    "season" INTEGER NOT NULL,
    "rating" INTEGER NOT NULL DEFAULT 1000,
    "wins" INTEGER NOT NULL DEFAULT 0,
    "losses" INTEGER NOT NULL DEFAULT 0,
    "draws" INTEGER NOT NULL DEFAULT 0,
    "placementsLeft" INTEGER NOT NULL DEFAULT 5,
    "lastPlayedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ranked_season_rating_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ranked_season_rating_userId_game_season_key" ON "ranked_season_rating"("userId", "game", "season");

-- CreateIndex
CREATE INDEX "ranked_season_rating_game_season_rating_idx" ON "ranked_season_rating"("game", "season", "rating" DESC);

-- AddForeignKey
ALTER TABLE "ranked_season_rating" ADD CONSTRAINT "ranked_season_rating_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
