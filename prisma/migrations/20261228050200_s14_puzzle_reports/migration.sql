-- s14-06 puzzle-reports: a member's report that a daily puzzle is wrong, one per member per puzzle.
CREATE TABLE "daily_puzzle_report" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "gameMode" TEXT NOT NULL,
    "dateKey" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "daily_puzzle_report_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "daily_puzzle_report_gameMode_dateKey_idx" ON "daily_puzzle_report"("gameMode", "dateKey");

-- CreateIndex
CREATE INDEX "daily_puzzle_report_userId_idx" ON "daily_puzzle_report"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "daily_puzzle_report_userId_gameMode_dateKey_key" ON "daily_puzzle_report"("userId", "gameMode", "dateKey");

-- AddForeignKey
ALTER TABLE "daily_puzzle_report" ADD CONSTRAINT "daily_puzzle_report_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
