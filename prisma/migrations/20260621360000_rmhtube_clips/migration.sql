-- CreateTable
CREATE TABLE "rmhtube_clip" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "mediaType" TEXT NOT NULL DEFAULT 'youtube',
    "title" VARCHAR(120) NOT NULL,
    "startSeconds" INTEGER NOT NULL,
    "endSeconds" INTEGER NOT NULL,
    "thumbnailUrl" TEXT,
    "note" VARCHAR(300),
    "isPublic" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "rmhtube_clip_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "rmhtube_clip_userId_createdAt_idx" ON "rmhtube_clip"("userId", "createdAt" DESC);
CREATE INDEX "rmhtube_clip_isPublic_createdAt_idx" ON "rmhtube_clip"("isPublic", "createdAt" DESC);
ALTER TABLE "rmhtube_clip" ADD CONSTRAINT "rmhtube_clip_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "rmhtube_subscription" (
    "id" TEXT NOT NULL,
    "subscriberId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "rmhtube_subscription_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "rmhtube_subscription_subscriberId_channelId_key" ON "rmhtube_subscription"("subscriberId", "channelId");
CREATE INDEX "rmhtube_subscription_channelId_idx" ON "rmhtube_subscription"("channelId");
ALTER TABLE "rmhtube_subscription" ADD CONSTRAINT "rmhtube_subscription_subscriberId_fkey" FOREIGN KEY ("subscriberId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "rmhtube_subscription" ADD CONSTRAINT "rmhtube_subscription_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
