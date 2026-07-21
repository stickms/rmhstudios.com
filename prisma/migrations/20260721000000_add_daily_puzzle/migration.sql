-- CreateTable
CREATE TABLE "daily_puzzle" (
    "id" TEXT NOT NULL,
    "gameMode" TEXT NOT NULL,
    "dateKey" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'deepseek',
    "data" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "daily_puzzle_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "daily_puzzle_gameMode_dateKey_key" ON "daily_puzzle"("gameMode", "dateKey");
