-- s07-19 quiz polls: one correct option and an explanation on a poll (both null for every existing poll).
-- Additive only: two nullable columns, no backfill.
-- AlterTable
ALTER TABLE "rmheet_poll" ADD COLUMN     "correctOptionId" VARCHAR(30),
ADD COLUMN     "explanation" VARCHAR(280);
