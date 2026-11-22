-- Personal best history: one row each time a score set a first score or a new best (sprint 05 #04).
-- A new table with new indexes only, so the indexes are plain CREATE INDEX: nothing exists to lock.
-- CreateTable
CREATE TABLE "game_personal_best" (
    "id" BIGSERIAL NOT NULL,
    "userId" TEXT NOT NULL,
    "gameId" VARCHAR(60) NOT NULL,
    "score" INTEGER NOT NULL,
    "previous" INTEGER,
    "progress" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "game_personal_best_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "game_personal_best_userId_gameId_createdAt_idx" ON "game_personal_best"("userId", "gameId", "createdAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "game_personal_best_userId_gameId_score_key" ON "game_personal_best"("userId", "gameId", "score");

-- AddForeignKey
ALTER TABLE "game_personal_best" ADD CONSTRAINT "game_personal_best_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

