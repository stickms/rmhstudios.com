-- Co-hosts of member-hosted events (s05-05): who the host invited, and whether they accepted.
-- Additive: one new table with its index and two cascading foreign keys.

-- CreateTable
CREATE TABLE "event_cohost" (
    "eventId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" VARCHAR(9) NOT NULL DEFAULT 'invited',
    "invitedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "respondedAt" TIMESTAMP(3),

    CONSTRAINT "event_cohost_pkey" PRIMARY KEY ("eventId","userId")
);

-- CreateIndex
CREATE INDEX "event_cohost_userId_status_idx" ON "event_cohost"("userId", "status");

-- AddForeignKey
ALTER TABLE "event_cohost" ADD CONSTRAINT "event_cohost_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_cohost" ADD CONSTRAINT "event_cohost_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

