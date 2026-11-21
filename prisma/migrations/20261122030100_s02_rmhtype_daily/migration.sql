-- RMHType daily challenge: one row per member and UTC day, created by Start so the server owns the clock.
-- Scores stay null until a plausible Finish (lib/rmhtype/daily.server.ts).

-- CreateTable
CREATE TABLE "rmhtype_daily_entry" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "day" VARCHAR(8) NOT NULL,
    "passageId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "wpm" DOUBLE PRECISION,
    "accuracy" DOUBLE PRECISION,
    "timeMs" INTEGER,
    CONSTRAINT "rmhtype_daily_entry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "rmhtype_daily_entry_day_wpm_idx" ON "rmhtype_daily_entry"("day", "wpm" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "rmhtype_daily_entry_userId_day_key" ON "rmhtype_daily_entry"("userId", "day");

-- AddForeignKey
ALTER TABLE "rmhtype_daily_entry" ADD CONSTRAINT "rmhtype_daily_entry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
