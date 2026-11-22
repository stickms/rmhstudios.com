-- Study queue: per-member card suspension (manual or leech) and a lapse counter on the review row.
-- Additive nullable/defaulted columns only; no data is rewritten.
-- AlterTable
ALTER TABLE "flashcard_review" ADD COLUMN     "lapses" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "suspendReason" VARCHAR(8),
ADD COLUMN     "suspendedAt" TIMESTAMP(3);

