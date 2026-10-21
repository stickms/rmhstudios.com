-- Eversion level (spec amendment 2026-10-21): 'all' (every page transition) or
-- 'globe' (only navigations confirmed through the liquid-globe hub). Additive
-- only: a nullable column with no default and no backfill, so the old image
-- running during a blue/green swap never names it and an absent value means 'all'.
-- AlterTable
ALTER TABLE "appearance_preference" ADD COLUMN     "eversionLevel" VARCHAR(8);
