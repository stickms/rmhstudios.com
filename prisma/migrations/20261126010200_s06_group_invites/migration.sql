-- s06-09: invite links for group chats (chat_invite), the record of owner removals that stops a removed member
-- rejoining through a live link (chat_removal), and which link a member joined through.
-- AlterTable
ALTER TABLE "chat_member" ADD COLUMN     "joinedViaInviteId" TEXT;

-- CreateTable
CREATE TABLE "chat_invite" (
    "id" TEXT NOT NULL,
    "chatId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "code" VARCHAR(16) NOT NULL,
    "maxUses" INTEGER,
    "uses" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chat_invite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat_removal" (
    "chatId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "removedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chat_removal_pkey" PRIMARY KEY ("chatId","userId")
);

-- CreateIndex
CREATE UNIQUE INDEX "chat_invite_code_key" ON "chat_invite"("code");

-- CreateIndex
CREATE INDEX "chat_invite_chatId_revokedAt_idx" ON "chat_invite"("chatId", "revokedAt");

-- CreateIndex
CREATE INDEX "chat_invite_createdById_idx" ON "chat_invite"("createdById");

-- CreateIndex
CREATE INDEX "chat_removal_userId_idx" ON "chat_removal"("userId");

-- AddForeignKey
ALTER TABLE "chat_invite" ADD CONSTRAINT "chat_invite_chatId_fkey" FOREIGN KEY ("chatId") REFERENCES "chat"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_invite" ADD CONSTRAINT "chat_invite_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_removal" ADD CONSTRAINT "chat_removal_chatId_fkey" FOREIGN KEY ("chatId") REFERENCES "chat"("id") ON DELETE CASCADE ON UPDATE CASCADE;

