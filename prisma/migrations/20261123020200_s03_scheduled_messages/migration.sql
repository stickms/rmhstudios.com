-- Messages held for later (s03-12): one row per scheduled direct or group message,
-- delivered by the messages.send-scheduled cron through the normal send path.

-- CreateTable
CREATE TABLE "scheduled_chat_message" (
    "id" TEXT NOT NULL,
    "chatId" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "content" VARCHAR(2000) NOT NULL,
    "gifUrl" TEXT,
    "imageUrls" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "sendAt" TIMESTAMP(3) NOT NULL,
    "status" VARCHAR(10) NOT NULL DEFAULT 'pending',
    "failCode" VARCHAR(24),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "scheduled_chat_message_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "scheduled_chat_message_status_sendAt_idx" ON "scheduled_chat_message"("status", "sendAt");

-- CreateIndex
CREATE INDEX "scheduled_chat_message_senderId_chatId_idx" ON "scheduled_chat_message"("senderId", "chatId");

-- AddForeignKey
ALTER TABLE "scheduled_chat_message" ADD CONSTRAINT "scheduled_chat_message_chatId_fkey" FOREIGN KEY ("chatId") REFERENCES "chat"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scheduled_chat_message" ADD CONSTRAINT "scheduled_chat_message_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

