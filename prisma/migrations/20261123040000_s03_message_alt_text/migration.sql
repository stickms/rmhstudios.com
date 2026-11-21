-- Image descriptions (alt text) for images in direct and group messages, and for scheduled
-- messages that carry images. Additive: nullable-by-default arrays, old rows read as undescribed.

-- AlterTable
ALTER TABLE "scheduled_chat_message" ADD COLUMN     "imageAlts" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "chat_message" ADD COLUMN     "imageAlts" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "altsEditedAt" TIMESTAMP(3);

