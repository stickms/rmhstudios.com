-- CreateTable
CREATE TABLE "rmhtube_timed_comment" (
    "id" TEXT NOT NULL,
    "mediaUrl" VARCHAR(1024) NOT NULL,
    "userId" TEXT NOT NULL,
    "atSec" INTEGER NOT NULL,
    "body" VARCHAR(200) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rmhtube_timed_comment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rmhtube_watch_later" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "url" VARCHAR(1024) NOT NULL,
    "title" VARCHAR(256) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rmhtube_watch_later_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rmhtube_heat_bucket" (
    "mediaUrl" VARCHAR(1024) NOT NULL,
    "bucket" INTEGER NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "rmhtube_heat_bucket_pkey" PRIMARY KEY ("mediaUrl","bucket")
);

-- CreateTable
CREATE TABLE "rmhtube_commentary_track" (
    "id" TEXT NOT NULL,
    "mediaUrl" VARCHAR(1024) NOT NULL,
    "userId" TEXT NOT NULL,
    "title" VARCHAR(80) NOT NULL,
    "lines" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rmhtube_commentary_track_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "rmhtube_timed_comment_mediaUrl_atSec_idx" ON "rmhtube_timed_comment"("mediaUrl", "atSec");

-- CreateIndex
CREATE INDEX "rmhtube_timed_comment_userId_idx" ON "rmhtube_timed_comment"("userId");

-- CreateIndex
CREATE INDEX "rmhtube_watch_later_userId_createdAt_idx" ON "rmhtube_watch_later"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "rmhtube_watch_later_userId_url_key" ON "rmhtube_watch_later"("userId", "url");

-- CreateIndex
CREATE INDEX "rmhtube_commentary_track_mediaUrl_createdAt_idx" ON "rmhtube_commentary_track"("mediaUrl", "createdAt");

-- CreateIndex
CREATE INDEX "rmhtube_commentary_track_userId_idx" ON "rmhtube_commentary_track"("userId");

-- AddForeignKey
ALTER TABLE "rmhtube_timed_comment" ADD CONSTRAINT "rmhtube_timed_comment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rmhtube_watch_later" ADD CONSTRAINT "rmhtube_watch_later_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rmhtube_commentary_track" ADD CONSTRAINT "rmhtube_commentary_track_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

