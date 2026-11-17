-- Email preferences, admin email campaigns and the per-user delivery log.
-- Additive only. The three preference columns carry their defaults, so every
-- existing row reads security and announcement mail on, product news off; a
-- user with no row reads the same defaults in code.

-- AlterTable
ALTER TABLE "notification_preference" ADD COLUMN "emailSecurity" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "emailAnnouncements" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "emailProduct" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "email_campaign" (
    "id" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "subject" VARCHAR(200) NOT NULL,
    "body" TEXT NOT NULL,
    "category" VARCHAR(16) NOT NULL,
    "audience" JSONB NOT NULL,
    "status" VARCHAR(12) NOT NULL DEFAULT 'sending',
    "total" INTEGER NOT NULL DEFAULT 0,
    "sent" INTEGER NOT NULL DEFAULT 0,
    "failed" INTEGER NOT NULL DEFAULT 0,
    "skipped" INTEGER NOT NULL DEFAULT 0,
    "duplicates" INTEGER NOT NULL DEFAULT 0,
    "throttled" INTEGER NOT NULL DEFAULT 0,
    "contentHash" VARCHAR(64) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastBatchAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "email_campaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_campaign_recipient" (
    "campaignId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" VARCHAR(8) NOT NULL DEFAULT 'pending',
    "sentAt" TIMESTAMP(3),

    CONSTRAINT "email_campaign_recipient_pkey" PRIMARY KEY ("campaignId","userId")
);

-- CreateTable
CREATE TABLE "email_delivery" (
    "id" BIGSERIAL NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" VARCHAR(16) NOT NULL,
    "dedupeKey" VARCHAR(200) NOT NULL,
    "campaignId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_delivery_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "email_campaign_contentHash_createdAt_idx" ON "email_campaign"("contentHash", "createdAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "email_delivery_userId_dedupeKey_key" ON "email_delivery"("userId", "dedupeKey");

-- CreateIndex
CREATE INDEX "email_delivery_userId_kind_createdAt_idx" ON "email_delivery"("userId", "kind", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "email_campaign_createdAt_idx" ON "email_campaign"("createdAt" DESC);

-- CreateIndex
CREATE INDEX "email_campaign_recipient_campaignId_status_idx" ON "email_campaign_recipient"("campaignId", "status");

-- CreateIndex
CREATE INDEX "email_campaign_recipient_userId_idx" ON "email_campaign_recipient"("userId");

-- AddForeignKey
ALTER TABLE "email_campaign" ADD CONSTRAINT "email_campaign_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_campaign_recipient" ADD CONSTRAINT "email_campaign_recipient_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "email_campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_campaign_recipient" ADD CONSTRAINT "email_campaign_recipient_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_delivery" ADD CONSTRAINT "email_delivery_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
