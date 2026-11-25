-- s14-13 supporter-marks: a creator's switch for the "Supporter" mark on replies under their own posts.
-- A constant default on a NOT NULL column, so the change is metadata-only; no index.
ALTER TABLE "user_profile" ADD COLUMN "showSupporterMarks" BOOLEAN NOT NULL DEFAULT true;
