-- RMH Music Phase 6: the Daily board's evidence. Additive only: two nullable columns, one column
-- with a default, and an index; nothing existing changes. Rows scored before this migration keep
-- `ranked = false` on purpose (no backfill): the board starts on the day this deploys.

-- AlterTable
ALTER TABLE "music_sprint_daily" ADD COLUMN     "hiddenAt" TIMESTAMP(3),
ADD COLUMN     "ranked" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "unrankedReason" VARCHAR(16);

-- CreateIndex
CREATE INDEX "music_sprint_daily_date_ranked_score_avgMs_idx" ON "music_sprint_daily"("date", "ranked", "score" DESC, "avgMs");
