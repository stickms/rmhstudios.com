-- The programming grid (L1): the platform's schedule.

-- CreateTable
CREATE TABLE "scheduled_slot" (
    "id" TEXT NOT NULL,
    "kind" VARCHAR(24) NOT NULL,
    "title" VARCHAR(120) NOT NULL,
    "href" VARCHAR(200),
    "startsAt" TIMESTAMP(3) NOT NULL,
    "durationMinutes" INTEGER NOT NULL DEFAULT 0,
    "recurrence" VARCHAR(8) NOT NULL DEFAULT 'once',
    "until" TIMESTAMP(3),
    "published" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "scheduled_slot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "scheduled_slot_published_startsAt_idx" ON "scheduled_slot"("published", "startsAt");
