-- s15-07: a review of a puzzle report. Three nullable columns, so the change is additive.
ALTER TABLE "daily_puzzle_report"
  ADD COLUMN "reviewedAt" TIMESTAMP(3),
  ADD COLUMN "reviewOutcome" VARCHAR(8),
  ADD COLUMN "reviewNote" TEXT;
