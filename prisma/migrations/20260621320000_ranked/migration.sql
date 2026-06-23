-- CreateTable
CREATE TABLE "elo_rating" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "game" VARCHAR(40) NOT NULL,
    "rating" INTEGER NOT NULL DEFAULT 1000,
    "wins" INTEGER NOT NULL DEFAULT 0,
    "losses" INTEGER NOT NULL DEFAULT 0,
    "draws" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "elo_rating_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "elo_rating_userId_game_key" ON "elo_rating"("userId", "game");
CREATE INDEX "elo_rating_game_rating_idx" ON "elo_rating"("game", "rating" DESC);
ALTER TABLE "elo_rating" ADD CONSTRAINT "elo_rating_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "ranked_challenge" (
    "id" TEXT NOT NULL,
    "game" VARCHAR(40) NOT NULL,
    "challengerId" TEXT NOT NULL,
    "opponentId" TEXT NOT NULL,
    "status" VARCHAR(12) NOT NULL DEFAULT 'pending',
    "winnerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    CONSTRAINT "ranked_challenge_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ranked_challenge_opponentId_status_idx" ON "ranked_challenge"("opponentId", "status");
CREATE INDEX "ranked_challenge_challengerId_status_idx" ON "ranked_challenge"("challengerId", "status");
ALTER TABLE "ranked_challenge" ADD CONSTRAINT "ranked_challenge_challengerId_fkey" FOREIGN KEY ("challengerId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ranked_challenge" ADD CONSTRAINT "ranked_challenge_opponentId_fkey" FOREIGN KEY ("opponentId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
