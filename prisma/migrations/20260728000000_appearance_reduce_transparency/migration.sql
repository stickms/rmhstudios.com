-- Adds the `reduceTransparency` column that schema.prisma has declared on
-- AppearancePreference since the appearance suite landed, but which no
-- migration ever created. Databases built with `prisma migrate deploy` (every
-- production deploy) therefore lacked it, and GET /api/preferences/appearance
-- threw `The column t0.reduceTransparency does not exist` on every signed-in
-- page load — swallowed client-side, so cross-device appearance settings
-- silently never loaded.
--
-- IF NOT EXISTS because databases created with `prisma db push` (local dev)
-- already have the column; this must be a no-op there rather than a failure.

-- AlterTable
ALTER TABLE "appearance_preference"
ADD COLUMN IF NOT EXISTS "reduceTransparency" BOOLEAN NOT NULL DEFAULT false;
