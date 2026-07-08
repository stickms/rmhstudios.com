-- CreateTable
CREATE TABLE "rmheet_reaction" (
    "id" TEXT NOT NULL,
    "rmheetId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "emoji" VARCHAR(32) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rmheet_reaction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "rmheet_reaction_rmheetId_idx" ON "rmheet_reaction"("rmheetId");

-- CreateIndex
CREATE UNIQUE INDEX "rmheet_reaction_rmheetId_userId_emoji_key" ON "rmheet_reaction"("rmheetId", "userId", "emoji");

-- CreateTable
CREATE TABLE "rmheet_comment_reaction" (
    "id" TEXT NOT NULL,
    "commentId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "emoji" VARCHAR(32) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rmheet_comment_reaction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "rmheet_comment_reaction_commentId_idx" ON "rmheet_comment_reaction"("commentId");

-- CreateIndex
CREATE UNIQUE INDEX "rmheet_comment_reaction_commentId_userId_emoji_key" ON "rmheet_comment_reaction"("commentId", "userId", "emoji");

-- CreateTable
CREATE TABLE "direct_message_reaction" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "emoji" VARCHAR(32) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "direct_message_reaction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "direct_message_reaction_messageId_idx" ON "direct_message_reaction"("messageId");

-- CreateIndex
CREATE UNIQUE INDEX "direct_message_reaction_messageId_userId_emoji_key" ON "direct_message_reaction"("messageId", "userId", "emoji");

-- CreateTable
CREATE TABLE "group_message_reaction" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "emoji" VARCHAR(32) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "group_message_reaction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "group_message_reaction_messageId_idx" ON "group_message_reaction"("messageId");

-- CreateIndex
CREATE UNIQUE INDEX "group_message_reaction_messageId_userId_emoji_key" ON "group_message_reaction"("messageId", "userId", "emoji");

-- AddForeignKey
ALTER TABLE "rmheet_reaction" ADD CONSTRAINT "rmheet_reaction_rmheetId_fkey" FOREIGN KEY ("rmheetId") REFERENCES "rmheet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rmheet_reaction" ADD CONSTRAINT "rmheet_reaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rmheet_comment_reaction" ADD CONSTRAINT "rmheet_comment_reaction_commentId_fkey" FOREIGN KEY ("commentId") REFERENCES "rmheet_comment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rmheet_comment_reaction" ADD CONSTRAINT "rmheet_comment_reaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "direct_message_reaction" ADD CONSTRAINT "direct_message_reaction_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "direct_message"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "direct_message_reaction" ADD CONSTRAINT "direct_message_reaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_message_reaction" ADD CONSTRAINT "group_message_reaction_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "group_message"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_message_reaction" ADD CONSTRAINT "group_message_reaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
