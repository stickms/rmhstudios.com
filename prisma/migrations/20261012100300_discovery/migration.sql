-- CreateTable
CREATE TABLE "daily_digest_snapshot" (
    "day" VARCHAR(10) NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "daily_digest_snapshot_pkey" PRIMARY KEY ("day")
);

-- CreateTable
CREATE TABLE "custom_feed" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "name" VARCHAR(60) NOT NULL,
    "description" VARCHAR(200),
    "tags" TEXT[],
    "authorIds" TEXT[],
    "keywords" TEXT[],
    "isPublic" BOOLEAN NOT NULL DEFAULT false,
    "subscriberCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "custom_feed_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "custom_feed_subscription" (
    "feedId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "custom_feed_subscription_pkey" PRIMARY KEY ("feedId","userId")
);

-- CreateTable
CREATE TABLE "memories_opt_in" (
    "userId" TEXT NOT NULL,
    "lastDay" VARCHAR(10),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "memories_opt_in_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "keyword_alert" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "query" VARCHAR(80) NOT NULL,
    "anchor" VARCHAR(64) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "keyword_alert_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "keyword_alert_hit" (
    "userId" TEXT NOT NULL,
    "rmheetId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "keyword_alert_hit_pkey" PRIMARY KEY ("userId","rmheetId")
);

-- CreateTable
CREATE TABLE "watch" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" VARCHAR(16) NOT NULL,
    "targetId" VARCHAR(200) NOT NULL,
    "level" VARCHAR(12) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "watch_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "custom_feed_ownerId_idx" ON "custom_feed"("ownerId");

-- CreateIndex
CREATE INDEX "custom_feed_isPublic_subscriberCount_idx" ON "custom_feed"("isPublic", "subscriberCount" DESC);

-- CreateIndex
CREATE INDEX "custom_feed_subscription_userId_createdAt_idx" ON "custom_feed_subscription"("userId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "keyword_alert_anchor_idx" ON "keyword_alert"("anchor");

-- CreateIndex
CREATE UNIQUE INDEX "keyword_alert_userId_query_key" ON "keyword_alert"("userId", "query");

-- CreateIndex
CREATE INDEX "keyword_alert_hit_createdAt_idx" ON "keyword_alert_hit"("createdAt");

-- CreateIndex
CREATE INDEX "watch_kind_targetId_idx" ON "watch"("kind", "targetId");

-- CreateIndex
CREATE UNIQUE INDEX "watch_userId_kind_targetId_key" ON "watch"("userId", "kind", "targetId");

-- AddForeignKey
ALTER TABLE "custom_feed" ADD CONSTRAINT "custom_feed_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "custom_feed_subscription" ADD CONSTRAINT "custom_feed_subscription_feedId_fkey" FOREIGN KEY ("feedId") REFERENCES "custom_feed"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "custom_feed_subscription" ADD CONSTRAINT "custom_feed_subscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memories_opt_in" ADD CONSTRAINT "memories_opt_in_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "keyword_alert" ADD CONSTRAINT "keyword_alert_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "keyword_alert_hit" ADD CONSTRAINT "keyword_alert_hit_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "watch" ADD CONSTRAINT "watch_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

