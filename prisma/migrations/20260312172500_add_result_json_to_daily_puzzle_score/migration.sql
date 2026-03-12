-- CreateTable
CREATE TABLE "daily_puzzle_score" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "gameMode" TEXT NOT NULL,
    "dateKey" TEXT NOT NULL,
    "score" INTEGER NOT NULL DEFAULT 0,
    "moves" INTEGER,
    "hintUsed" BOOLEAN DEFAULT false,
    "dnf" BOOLEAN DEFAULT false,
    "resultJson" JSONB,
    "timeSeconds" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "daily_puzzle_score_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "daily_puzzle_score_userId_gameMode_dateKey_key" ON "daily_puzzle_score"("userId", "gameMode", "dateKey");

-- CreateIndex
CREATE INDEX "daily_puzzle_score_gameMode_dateKey_score_idx" ON "daily_puzzle_score"("gameMode", "dateKey", "score" DESC);

-- CreateIndex
CREATE INDEX "daily_puzzle_score_gameMode_dateKey_moves_idx" ON "daily_puzzle_score"("gameMode", "dateKey", "moves" ASC);

-- AddForeignKey
ALTER TABLE "daily_puzzle_score" ADD CONSTRAINT "daily_puzzle_score_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
