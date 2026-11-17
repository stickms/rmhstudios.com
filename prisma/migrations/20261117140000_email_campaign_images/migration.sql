-- Admin emails: the site images (uploaded or AI-generated) shown in the
-- message, and an optional designed layout (structured blocks the site's
-- template draws; null means the plain layout). Additive: past sends keep an
-- empty picture list and the plain layout.

-- AlterTable
ALTER TABLE "email_campaign" ADD COLUMN "imageUrls" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN "design" JSONB;
