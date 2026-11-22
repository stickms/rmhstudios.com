-- Quiet counts (sprint 04 #14): two switches on the member profile, one withholding the numbers on
-- their posts from everyone else, one hiding numbers while they browse. Both default off.
-- AlterTable
ALTER TABLE "user_profile" ADD COLUMN     "hideCountsInFeed" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "hideCountsOnMine" BOOLEAN NOT NULL DEFAULT false;
