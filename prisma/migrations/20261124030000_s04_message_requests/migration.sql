-- Message requests (sprint 04 #16): a refused first DM waits in the recipient's Requests folder.
-- Adds user_profile.dmRequests (default off) and the message_request table; nothing is rewritten.

-- AlterTable
ALTER TABLE "user_profile" ADD COLUMN     "dmRequests" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "message_request" (
    "id" TEXT NOT NULL,
    "chatId" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "recipientId" TEXT NOT NULL,
    "status" VARCHAR(10) NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt" TIMESTAMP(3),

    CONSTRAINT "message_request_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "message_request_chatId_key" ON "message_request"("chatId");

-- CreateIndex
CREATE INDEX "message_request_recipientId_status_createdAt_idx" ON "message_request"("recipientId", "status", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "message_request_senderId_recipientId_decidedAt_idx" ON "message_request"("senderId", "recipientId", "decidedAt");

-- AddForeignKey
ALTER TABLE "message_request" ADD CONSTRAINT "message_request_chatId_fkey" FOREIGN KEY ("chatId") REFERENCES "chat"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_request" ADD CONSTRAINT "message_request_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_request" ADD CONSTRAINT "message_request_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

