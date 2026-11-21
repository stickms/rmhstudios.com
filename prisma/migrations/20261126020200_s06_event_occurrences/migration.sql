-- Per-date skip and move for repeating events (s06-10): one row per changed occurrence,
-- keyed by the original start, so answers keyed by that start carry over a move.

-- CreateTable
CREATE TABLE "event_occurrence_override" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "occurrenceAt" TIMESTAMP(3) NOT NULL,
    "kind" VARCHAR(4) NOT NULL,
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "note" VARCHAR(200),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "event_occurrence_override_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "event_occurrence_override_eventId_idx" ON "event_occurrence_override"("eventId");

-- CreateIndex
CREATE UNIQUE INDEX "event_occurrence_override_eventId_occurrenceAt_key" ON "event_occurrence_override"("eventId", "occurrenceAt");

-- AddForeignKey
ALTER TABLE "event_occurrence_override" ADD CONSTRAINT "event_occurrence_override_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

