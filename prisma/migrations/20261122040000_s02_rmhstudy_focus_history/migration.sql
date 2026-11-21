-- RMHStudy focus history: an optional weekly goal on the profile. The (userId,
-- startedAt) index the sessions list pages on is built concurrently in the next one.
-- AlterTable
ALTER TABLE "rmhstudy_profile" ADD COLUMN     "weeklyGoalMinutes" INTEGER;
