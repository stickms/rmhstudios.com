-- Content warning reasons (sprint 06 #16): an optional 80-character reason on a post and on a scheduled post, and a
-- reader preference to show warned posts instead of covering them. All additive: nullable or defaulted columns.

-- AlterTable
ALTER TABLE "user_profile" ADD COLUMN     "showContentWarnings" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "rmheet" ADD COLUMN     "contentWarning" VARCHAR(80);

-- AlterTable
ALTER TABLE "scheduled_post" ADD COLUMN     "contentWarning" VARCHAR(80);

