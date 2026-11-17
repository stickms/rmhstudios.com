-- Email preferences and admin email campaigns.
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
