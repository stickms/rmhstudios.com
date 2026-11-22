-- s07-05: ChatMention records which current members a group message @mentions,
-- so "Your mentions" in the group info dialog is one indexed read. Additive only.
-- CreateTable
CREATE TABLE "chat_mention" (
    "messageId" TEXT NOT NULL,
    "chatId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chat_mention_pkey" PRIMARY KEY ("messageId","userId")
);

-- CreateIndex
CREATE INDEX "chat_mention_userId_chatId_createdAt_idx" ON "chat_mention"("userId", "chatId", "createdAt" DESC);

-- AddForeignKey
ALTER TABLE "chat_mention" ADD CONSTRAINT "chat_mention_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "chat_message"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_mention" ADD CONSTRAINT "chat_mention_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

