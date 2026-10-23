-- Plasmatic Jelly preferences (master plan R8/R9): "Jelly motion"
-- ('lively' | 'calm' | 'still') and "Electric arcs" ('full' | 'clicks' | 'off').
-- Additive only: nullable columns with no default and no backfill, so the old
-- image running during a blue/green swap never names them and NULL means the
-- built-in default. The retired `reduceMotion` column is deliberately NOT
-- reused — it holds stale values with different semantics.
-- AlterTable
ALTER TABLE "appearance_preference" ADD COLUMN     "jellyMotion" VARCHAR(8),
ADD COLUMN     "electricArcs" VARCHAR(8);
