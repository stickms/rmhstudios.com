-- Pictures in admin emails: the site images (uploaded or AI-generated) shown
-- under the message. Additive, with an empty-array default for past sends.

-- AlterTable
ALTER TABLE "email_campaign" ADD COLUMN "imageUrls" TEXT[] DEFAULT ARRAY[]::TEXT[];
