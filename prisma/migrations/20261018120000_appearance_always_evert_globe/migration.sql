-- "Always evert globe" (spec amendment 2026-10-18): run the globe-eversion
-- navigation transition even where it is normally skipped for performance.
-- Additive only: a NOT NULL column WITH a default, so the old image running
-- during a blue/green swap never names it and existing rows read as false (off).
-- AlterTable
ALTER TABLE "appearance_preference" ADD COLUMN     "alwaysEvertGlobe" BOOLEAN NOT NULL DEFAULT false;
