-- AlterTable: rich attachments on feed announcements
ALTER TABLE "feed_announcement" ADD COLUMN "imageUrls" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "feed_announcement" ADD COLUMN "gifUrl" TEXT;

-- CreateTable: announcement polls
CREATE TABLE "feed_announcement_poll" (
    "id" TEXT NOT NULL,
    "announcementId" TEXT NOT NULL,
    "question" VARCHAR(200) NOT NULL,
    "multiSelect" BOOLEAN NOT NULL DEFAULT false,
    "closesAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "feed_announcement_poll_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "feed_announcement_poll_announcementId_key" ON "feed_announcement_poll"("announcementId");

CREATE TABLE "feed_announcement_poll_option" (
    "id" TEXT NOT NULL,
    "pollId" TEXT NOT NULL,
    "text" VARCHAR(80) NOT NULL,
    "position" INTEGER NOT NULL,
    CONSTRAINT "feed_announcement_poll_option_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "feed_announcement_poll_option_pollId_idx" ON "feed_announcement_poll_option"("pollId");

CREATE TABLE "feed_announcement_poll_vote" (
    "id" TEXT NOT NULL,
    "optionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "feed_announcement_poll_vote_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "feed_announcement_poll_vote_optionId_userId_key" ON "feed_announcement_poll_vote"("optionId", "userId");
CREATE INDEX "feed_announcement_poll_vote_optionId_idx" ON "feed_announcement_poll_vote"("optionId");

-- AddForeignKey
ALTER TABLE "feed_announcement_poll" ADD CONSTRAINT "feed_announcement_poll_announcementId_fkey" FOREIGN KEY ("announcementId") REFERENCES "feed_announcement"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "feed_announcement_poll_option" ADD CONSTRAINT "feed_announcement_poll_option_pollId_fkey" FOREIGN KEY ("pollId") REFERENCES "feed_announcement_poll"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "feed_announcement_poll_vote" ADD CONSTRAINT "feed_announcement_poll_vote_optionId_fkey" FOREIGN KEY ("optionId") REFERENCES "feed_announcement_poll_option"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "feed_announcement_poll_vote" ADD CONSTRAINT "feed_announcement_poll_vote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
