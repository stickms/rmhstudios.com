-- s14-08 game-reports: a moderator's removal of a reviewed, guided or tipped item is a stamp the author cannot undo.
-- Nullable columns with no default and no index, so the change is metadata-only.
ALTER TABLE "game_review" ADD COLUMN "moderatedAt" TIMESTAMP(3);
ALTER TABLE "game_guide" ADD COLUMN "moderatedAt" TIMESTAMP(3);
ALTER TABLE "achievement_tip" ADD COLUMN "moderatedAt" TIMESTAMP(3);
