-- CreateTable
CREATE TABLE "group_chat" (
    "id" TEXT NOT NULL,
    "name" VARCHAR(60) NOT NULL,
    "ownerId" TEXT NOT NULL,
    "lastMessageAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "group_chat_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "group_chat" ADD CONSTRAINT "group_chat_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "group_chat_member" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "lastReadAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "group_chat_member_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "group_chat_member_groupId_userId_key" ON "group_chat_member"("groupId", "userId");
CREATE INDEX "group_chat_member_userId_idx" ON "group_chat_member"("userId");
ALTER TABLE "group_chat_member" ADD CONSTRAINT "group_chat_member_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "group_chat"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "group_chat_member" ADD CONSTRAINT "group_chat_member_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "group_message" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "content" VARCHAR(2000) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "group_message_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "group_message_groupId_createdAt_idx" ON "group_message"("groupId", "createdAt");
ALTER TABLE "group_message" ADD CONSTRAINT "group_message_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "group_chat"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "group_message" ADD CONSTRAINT "group_message_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
