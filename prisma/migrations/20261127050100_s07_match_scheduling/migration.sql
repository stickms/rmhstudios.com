-- Match times and deadlines in tournaments (s07-06): a per-tournament deadline setting, and on each match its deadline,
-- a live time proposal, the agreed time and the claimed-once reminder markers. Additive columns only.

-- AlterTable
ALTER TABLE "tournament" ADD COLUMN     "matchDeadlineHours" INTEGER;

-- AlterTable
ALTER TABLE "tournament_match" ADD COLUMN     "agreedNoticeAt" TIMESTAMP(3),
ADD COLUMN     "deadlineAt" TIMESTAMP(3),
ADD COLUMN     "deadlineNoticeAt" TIMESTAMP(3),
ADD COLUMN     "proposedAt" TIMESTAMP(3),
ADD COLUMN     "proposedById" TEXT,
ADD COLUMN     "remindedAt" TIMESTAMP(3);
