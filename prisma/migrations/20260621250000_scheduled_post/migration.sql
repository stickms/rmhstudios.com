-- CreateTable
CREATE TABLE "scheduled_post" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "gifUrl" TEXT,
    "imageUrls" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "audience" "RMHarkAudience" NOT NULL DEFAULT 'PUBLIC',
    "unlockPrice" INTEGER,
    "communityId" TEXT,
    "poll" JSONB,
    "scheduledAt" TIMESTAMP(3),
    "publishedId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "scheduled_post_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "scheduled_post_userId_idx" ON "scheduled_post"("userId");
CREATE INDEX "scheduled_post_scheduledAt_idx" ON "scheduled_post"("scheduledAt");
ALTER TABLE "scheduled_post" ADD CONSTRAINT "scheduled_post_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
