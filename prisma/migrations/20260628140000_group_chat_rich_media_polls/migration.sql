-- Rich media + polls for group chats: an optional single GIF and up to 4 images
-- (mirroring DMs), plus an optional inline poll (question + option labels with
-- votes tracked in group_poll_vote).

-- AlterTable
ALTER TABLE "group_message" ADD COLUMN "gifUrl" TEXT;
ALTER TABLE "group_message" ADD COLUMN "imageUrls" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "group_message" ADD COLUMN "pollQuestion" VARCHAR(300);
ALTER TABLE "group_message" ADD COLUMN "pollOptions" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateTable
CREATE TABLE "group_poll_vote" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "optionIdx" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "group_poll_vote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "group_poll_vote_messageId_idx" ON "group_poll_vote"("messageId");

-- CreateIndex
CREATE UNIQUE INDEX "group_poll_vote_messageId_userId_key" ON "group_poll_vote"("messageId", "userId");

-- AddForeignKey
ALTER TABLE "group_poll_vote" ADD CONSTRAINT "group_poll_vote_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "group_message"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_poll_vote" ADD CONSTRAINT "group_poll_vote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
