-- s15-04 workshop-reports: a moderator's removal of a reported TF2 HUD, TF2 loadout or Versecraft seed listing is a
-- stamp its author cannot undo. Nullable columns with no default and no index, so the change is metadata-only.
ALTER TABLE "tf2_hud" ADD COLUMN "moderatedAt" TIMESTAMP(3);
ALTER TABLE "tf2_loadout" ADD COLUMN "moderatedAt" TIMESTAMP(3);
ALTER TABLE "versecraft_seed_listing" ADD COLUMN "moderatedAt" TIMESTAMP(3);
