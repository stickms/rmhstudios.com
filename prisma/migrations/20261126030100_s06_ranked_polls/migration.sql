-- Ranked-choice polls: a flag on the poll and the instant-runoff result cached when it ends.
-- Additive: a defaulted boolean and a nullable JSON column; every existing poll stays a plain poll.

-- AlterTable
ALTER TABLE "rmheet_poll" ADD COLUMN     "ranked" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "resultJson" JSONB;
