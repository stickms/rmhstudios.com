-- Monthly spending budget (s04-07): a self-set cap on non-wager coin spending,
-- with the same 24-hour wait on loosening as the daily staking cap.
-- AlterTable
ALTER TABLE "user_play_limits" ADD COLUMN     "monthlySpendCap" INTEGER,
ADD COLUMN     "pendingSpendCap" INTEGER,
ADD COLUMN     "pendingSpendCapAt" TIMESTAMP(3),
ADD COLUMN     "spendNoticeMonth" VARCHAR(7);

