-- The program set preference (owner 2026-11-23): four toggles, stored as a text array of 'md', 'md-phd', 'do', 'do-phd'.
-- Additive. An empty array means "not chosen": the older programFilter and degree columns stay and still answer for
-- rows written before this column existed.
ALTER TABLE "med_user_prefs" ADD COLUMN "programs" TEXT[] DEFAULT ARRAY[]::TEXT[];
