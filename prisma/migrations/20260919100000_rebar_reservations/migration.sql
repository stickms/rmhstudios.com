-- Rebar & Rutabaga reservations (W1): the first state behind any /services or
-- /ventures microsite.

-- CreateTable
CREATE TABLE "rebar_reservation" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "serviceDate" VARCHAR(10) NOT NULL,
    "seating" VARCHAR(5) NOT NULL,
    "partySize" INTEGER NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "email" VARCHAR(160) NOT NULL,
    "note" VARCHAR(500),
    "status" VARCHAR(16) NOT NULL DEFAULT 'booked',
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rebar_reservation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "rebar_reservation_serviceDate_seating_status_idx" ON "rebar_reservation"("serviceDate", "seating", "status");

-- CreateIndex
CREATE INDEX "rebar_reservation_userId_createdAt_idx" ON "rebar_reservation"("userId", "createdAt" DESC);

-- One LIVE booking per email per service. Partial, so cancelling frees the
-- night to be re-booked; a plain unique index would make a cancellation
-- permanent for that guest on that night.
--
-- This is what makes the double-submitted form safe: two concurrent inserts
-- race to the same key and the loser gets a unique violation, which the server
-- maps to "you already hold a table that night" rather than a 500. A read-then-
-- insert check cannot do that — both reads see no row.
CREATE UNIQUE INDEX "rebar_reservation_live_booking_key"
    ON "rebar_reservation"("email", "serviceDate", "seating")
    WHERE "status" = 'booked';

-- AddForeignKey
ALTER TABLE "rebar_reservation" ADD CONSTRAINT "rebar_reservation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
