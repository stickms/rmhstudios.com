-- P02 posts-plus (X4 X5 X8 X9 X11 Z7): additive only - new nullable/defaulted columns on
-- rmheet, scheduled_post and saved_item (no new rmheet index) and eight new tables.

-- AlterTable
ALTER TABLE "rmheet" ADD COLUMN     "expiresAt" TIMESTAMP(3),
ADD COLUMN     "seriesId" TEXT;

-- AlterTable
ALTER TABLE "scheduled_post" ADD COLUMN     "isCapsule" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "saved_item" ADD COLUMN     "note" VARCHAR(500);

-- CreateTable
CREATE TABLE "qotd_prompt" (
    "id" TEXT NOT NULL,
    "text" VARCHAR(280) NOT NULL,
    "dayKey" VARCHAR(10),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "qotd_prompt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "qotd_answer" (
    "postId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "dayKey" VARCHAR(10) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "qotd_answer_pkey" PRIMARY KEY ("postId")
);

-- CreateTable
CREATE TABLE "post_series" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" VARCHAR(80) NOT NULL,
    "description" VARCHAR(280),
    "postCount" INTEGER NOT NULL DEFAULT 0,
    "followCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "post_series_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "post_series_item" (
    "postId" TEXT NOT NULL,
    "seriesId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "post_series_item_pkey" PRIMARY KEY ("postId")
);

-- CreateTable
CREATE TABLE "post_series_follow" (
    "seriesId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "post_series_follow_pkey" PRIMARY KEY ("seriesId","userId")
);

-- CreateTable
CREATE TABLE "post_lifecycle" (
    "postId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "keepForever" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "post_lifecycle_pkey" PRIMARY KEY ("postId")
);

-- CreateTable
CREATE TABLE "post_auto_delete" (
    "userId" TEXT NOT NULL,
    "months" INTEGER NOT NULL,
    "lastRunAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "post_auto_delete_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "link_check" (
    "urlKey" VARCHAR(64) NOT NULL,
    "url" TEXT NOT NULL,
    "title" VARCHAR(300),
    "description" VARCHAR(500),
    "siteName" VARCHAR(120),
    "status" VARCHAR(10) NOT NULL DEFAULT 'ok',
    "failCount" INTEGER NOT NULL DEFAULT 0,
    "lastStatusCode" INTEGER,
    "lastCheckedAt" TIMESTAMP(3),
    "nextCheckAt" TIMESTAMP(3) NOT NULL,
    "archiveUrl" TEXT,
    "archiveTimestamp" VARCHAR(14),
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "link_check_pkey" PRIMARY KEY ("urlKey")
);

-- CreateIndex
CREATE UNIQUE INDEX "qotd_prompt_dayKey_key" ON "qotd_prompt"("dayKey");

-- CreateIndex
CREATE INDEX "qotd_prompt_dayKey_createdAt_idx" ON "qotd_prompt"("dayKey", "createdAt");

-- CreateIndex
CREATE INDEX "qotd_answer_dayKey_createdAt_idx" ON "qotd_answer"("dayKey", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "qotd_answer_userId_dayKey_idx" ON "qotd_answer"("userId", "dayKey");

-- CreateIndex
CREATE INDEX "post_series_userId_updatedAt_idx" ON "post_series"("userId", "updatedAt" DESC);

-- CreateIndex
CREATE INDEX "post_series_item_seriesId_position_idx" ON "post_series_item"("seriesId", "position");

-- CreateIndex
CREATE INDEX "post_series_follow_userId_idx" ON "post_series_follow"("userId");

-- CreateIndex
CREATE INDEX "post_series_follow_seriesId_createdAt_idx" ON "post_series_follow"("seriesId", "createdAt");

-- CreateIndex
CREATE INDEX "post_lifecycle_expiresAt_idx" ON "post_lifecycle"("expiresAt");

-- CreateIndex
CREATE INDEX "post_auto_delete_lastRunAt_idx" ON "post_auto_delete"("lastRunAt");

-- CreateIndex
CREATE INDEX "link_check_nextCheckAt_idx" ON "link_check"("nextCheckAt");

-- CreateIndex
CREATE INDEX "link_check_lastSeenAt_idx" ON "link_check"("lastSeenAt");

-- AddForeignKey
ALTER TABLE "qotd_prompt" ADD CONSTRAINT "qotd_prompt_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "qotd_answer" ADD CONSTRAINT "qotd_answer_postId_fkey" FOREIGN KEY ("postId") REFERENCES "rmheet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "qotd_answer" ADD CONSTRAINT "qotd_answer_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post_series" ADD CONSTRAINT "post_series_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post_series_item" ADD CONSTRAINT "post_series_item_postId_fkey" FOREIGN KEY ("postId") REFERENCES "rmheet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post_series_item" ADD CONSTRAINT "post_series_item_seriesId_fkey" FOREIGN KEY ("seriesId") REFERENCES "post_series"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post_series_follow" ADD CONSTRAINT "post_series_follow_seriesId_fkey" FOREIGN KEY ("seriesId") REFERENCES "post_series"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post_series_follow" ADD CONSTRAINT "post_series_follow_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post_lifecycle" ADD CONSTRAINT "post_lifecycle_postId_fkey" FOREIGN KEY ("postId") REFERENCES "rmheet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post_auto_delete" ADD CONSTRAINT "post_auto_delete_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

