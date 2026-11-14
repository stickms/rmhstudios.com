-- Bots react to sitewide announcements and to outside-world headlines.
-- `announcementPostId` is the RMHark that carries an announcement into the feed.
-- AlterTable
ALTER TABLE "blog_post" ADD COLUMN     "announcementPostId" TEXT;

-- CreateTable
CREATE TABLE "bot_reaction" (
    "id" BIGSERIAL NOT NULL,
    "botId" TEXT NOT NULL,
    "kind" VARCHAR(16) NOT NULL,
    "refKey" VARCHAR(200) NOT NULL,
    "postId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bot_reaction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "bot_reaction_kind_refKey_idx" ON "bot_reaction"("kind", "refKey");

-- CreateIndex
CREATE INDEX "bot_reaction_createdAt_idx" ON "bot_reaction"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "bot_reaction_botId_kind_refKey_key" ON "bot_reaction"("botId", "kind", "refKey");

-- AddForeignKey
ALTER TABLE "bot_reaction" ADD CONSTRAINT "bot_reaction_botId_fkey" FOREIGN KEY ("botId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
