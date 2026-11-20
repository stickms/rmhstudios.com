-- Off-peak RMHark bot queue: ordinary bot posts and their pre-written bot
-- conversations, written in DeepSeek's off-peak hours (lib/rmhark-ai/bot-queue.server.ts).

-- CreateTable
CREATE TABLE "bot_queued_post" (
    "id" BIGSERIAL NOT NULL,
    "botId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "imagePrompt" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "publishedPostId" TEXT,
    "publishedAt" TIMESTAMP(3),

    CONSTRAINT "bot_queued_post_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bot_queued_comment" (
    "id" BIGSERIAL NOT NULL,
    "queuedPostId" BIGINT NOT NULL,
    "botId" TEXT NOT NULL,
    "parentId" BIGINT,
    "content" TEXT NOT NULL,
    "delayMs" INTEGER NOT NULL,
    "publishAt" TIMESTAMP(3),
    "publishedCommentId" TEXT,
    "discardedAt" TIMESTAMP(3),

    CONSTRAINT "bot_queued_comment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "bot_queued_post_botId_publishedAt_createdAt_idx" ON "bot_queued_post"("botId", "publishedAt", "createdAt");

-- CreateIndex
CREATE INDEX "bot_queued_post_expiresAt_idx" ON "bot_queued_post"("expiresAt");

-- CreateIndex
CREATE INDEX "bot_queued_comment_publishAt_idx" ON "bot_queued_comment"("publishAt");

-- CreateIndex
CREATE INDEX "bot_queued_comment_queuedPostId_idx" ON "bot_queued_comment"("queuedPostId");

-- AddForeignKey
ALTER TABLE "bot_queued_post" ADD CONSTRAINT "bot_queued_post_botId_fkey" FOREIGN KEY ("botId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bot_queued_comment" ADD CONSTRAINT "bot_queued_comment_queuedPostId_fkey" FOREIGN KEY ("queuedPostId") REFERENCES "bot_queued_post"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bot_queued_comment" ADD CONSTRAINT "bot_queued_comment_botId_fkey" FOREIGN KEY ("botId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bot_queued_comment" ADD CONSTRAINT "bot_queued_comment_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "bot_queued_comment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

