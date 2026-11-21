-- Event updates (s06-11): a short note from the host, a co-host or an admin about an event or one date of it.
-- Additive: one new table with a cascade to event; no existing table changes.

-- CreateTable
CREATE TABLE "event_update" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "occurrenceAt" TIMESTAMP(3),
    "authorId" TEXT,
    "body" VARCHAR(500) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notifiedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "event_update_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "event_update_eventId_createdAt_idx" ON "event_update"("eventId", "createdAt" DESC);

-- AddForeignKey
ALTER TABLE "event_update" ADD CONSTRAINT "event_update_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

