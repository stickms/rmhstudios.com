-- Per-server toggle for Alex's random "ambient" broadcasts (the slice-of-life
-- posts). Default on. Care alerts and life events are unaffected.

ALTER TABLE "discord_alex_guild" ADD COLUMN "ambientEnabled" BOOLEAN NOT NULL DEFAULT true;
