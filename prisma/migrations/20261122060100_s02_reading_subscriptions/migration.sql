-- Reading subscriptions: a member follows the Logs, a Log tag, a News category or a story, and the
-- fan-out cursor records where the 15-minute notification job stopped (lib/reading/subscriptions.server.ts).

-- CreateTable
CREATE TABLE "reading_subscription" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" VARCHAR(16) NOT NULL,
    "target" VARCHAR(80) NOT NULL DEFAULT '',
    "inApp" BOOLEAN NOT NULL DEFAULT true,
    "email" BOOLEAN NOT NULL DEFAULT false,
    "lastEmailedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reading_subscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reading_fanout_cursor" (
    "name" TEXT NOT NULL,
    "lastSeenAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reading_fanout_cursor_pkey" PRIMARY KEY ("name")
);

-- CreateIndex
CREATE INDEX "reading_subscription_kind_target_idx" ON "reading_subscription"("kind", "target");

-- CreateIndex
CREATE UNIQUE INDEX "reading_subscription_userId_kind_target_key" ON "reading_subscription"("userId", "kind", "target");

-- AddForeignKey
ALTER TABLE "reading_subscription" ADD CONSTRAINT "reading_subscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

