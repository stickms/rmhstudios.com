-- RMHStudy streaks count the member's own calendar days: the hub stores the zone sent on joining a room.
-- Nullable, so existing profiles keep counting UTC days until they join again.

-- AlterTable
ALTER TABLE "rmhstudy_profile" ADD COLUMN     "timeZone" VARCHAR(40);
