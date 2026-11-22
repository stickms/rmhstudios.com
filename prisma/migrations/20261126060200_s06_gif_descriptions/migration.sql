-- Describe GIFs: a nullable plain-text description beside each in-scope gifUrl
-- (posts, scheduled posts, chat messages, scheduled chat messages). Additive only.
-- AlterTable
ALTER TABLE "scheduled_chat_message" ADD COLUMN     "gifAlt" VARCHAR(1000);

-- AlterTable
ALTER TABLE "chat_message" ADD COLUMN     "gifAlt" VARCHAR(1000);

-- AlterTable
ALTER TABLE "rmheet" ADD COLUMN     "gifAlt" VARCHAR(1000);

-- AlterTable
ALTER TABLE "scheduled_post" ADD COLUMN     "gifAlt" VARCHAR(1000);

