-- Compressed blob storage for the TF2 HUD editor. Additive only: defaults keep any row
-- written by the previous code valid ("none" = stored as-is).
-- AlterTable
ALTER TABLE "tf2_hud_blob" ADD COLUMN     "encoding" VARCHAR(8) NOT NULL DEFAULT 'none',
ADD COLUMN     "storedSize" INTEGER NOT NULL DEFAULT 0;
