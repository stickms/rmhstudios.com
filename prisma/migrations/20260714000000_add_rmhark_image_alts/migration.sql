-- Per-image alt text for RMHark posts (accessibility). Aligned by index with
-- "imageUrls"; may be shorter than imageUrls (a missing entry = no description).
ALTER TABLE "rmheet" ADD COLUMN "imageAlts" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- Carry the same alt text on drafts / scheduled posts so it survives publish.
ALTER TABLE "scheduled_post" ADD COLUMN "imageAlts" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
