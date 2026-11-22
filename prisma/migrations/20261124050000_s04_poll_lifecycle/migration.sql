-- s04-08 poll lifecycle: an author can end a poll early or extend it, and a per-minute job tells the author and
-- the voters once. Additive: three nullable columns and one data backfill; the two indexes the job
-- reads are built CONCURRENTLY by the next migrations.

-- AlterTable
ALTER TABLE "rmheet_poll" ADD COLUMN     "closedAt" TIMESTAMP(3),
ADD COLUMN     "endNotifiedAt" TIMESTAMP(3),
ADD COLUMN     "extendedAt" TIMESTAMP(3);

-- Polls that already ended before this release are not announced now: only polls that end from here on are.
UPDATE "rmheet_poll" SET "endNotifiedAt" = NOW() WHERE "closesAt" IS NOT NULL AND "closesAt" <= NOW();
