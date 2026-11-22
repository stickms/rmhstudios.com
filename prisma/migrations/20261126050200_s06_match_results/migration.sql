-- Match results (s06-20): a participant's report is a claim the opponent confirms or disputes.
-- Adds nullable claim and dispute columns to tournament_match; the claim index is its own migration.
-- AlterTable
ALTER TABLE "tournament_match" ADD COLUMN     "claimedAt" TIMESTAMP(3),
ADD COLUMN     "claimedById" TEXT,
ADD COLUMN     "claimedWinnerId" TEXT,
ADD COLUMN     "disputeNote" VARCHAR(300),
ADD COLUMN     "disputedAt" TIMESTAMP(3),
ADD COLUMN     "disputedById" TEXT;
