-- CreateTable
CREATE TABLE "feed_announcement" (
    "id" TEXT NOT NULL,
    "title" VARCHAR(120) NOT NULL,
    "body" VARCHAR(1000) NOT NULL,
    "linkUrl" VARCHAR(500),
    "linkLabel" VARCHAR(60),
    "variant" VARCHAR(16) NOT NULL DEFAULT 'info',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "pinned" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "feed_announcement_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "feed_announcement_active_createdAt_idx" ON "feed_announcement"("active", "createdAt" DESC);
ALTER TABLE "feed_announcement" ADD CONSTRAINT "feed_announcement_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
