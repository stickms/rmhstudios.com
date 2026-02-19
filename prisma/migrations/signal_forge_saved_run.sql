-- Add saved run state column to SignalForgePlayer
ALTER TABLE "SignalForgePlayer" ADD COLUMN IF NOT EXISTS "savedRunState" JSONB;
