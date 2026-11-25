-- Home listing photo descriptions (s11 14): one description per photo, in the order of "images" ('' = not described).
-- Existing listings keep an empty array and read with the fallback text; no backfill.
ALTER TABLE "home_listing" ADD COLUMN "imageAlts" TEXT[] DEFAULT ARRAY[]::TEXT[];
